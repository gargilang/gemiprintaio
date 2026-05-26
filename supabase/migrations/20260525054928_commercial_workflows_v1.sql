-- Commercial workflows V1:
-- quotes, purchase orders, formal returns, stock opname, and return-aware
-- inventory/finance primitives.

-- ---------------------------------------------------------------------------
-- Existing document link columns
-- ---------------------------------------------------------------------------
ALTER TABLE penjualan
  ADD COLUMN IF NOT EXISTS penawaran_id TEXT;

ALTER TABLE pembelian
  ADD COLUMN IF NOT EXISTS purchase_order_id TEXT;

ALTER TABLE item_pembelian
  ADD COLUMN IF NOT EXISTS purchase_order_item_id TEXT;

CREATE INDEX IF NOT EXISTS idx_penjualan_penawaran ON penjualan(penawaran_id);
CREATE INDEX IF NOT EXISTS idx_pembelian_purchase_order ON pembelian(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_item_pembelian_po_item ON item_pembelian(purchase_order_item_id);

-- ---------------------------------------------------------------------------
-- Inventory movement type: SALE_RETURN
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT c.conname
  INTO v_constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'inventory_movements'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%movement_type%'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.inventory_movements DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (movement_type IN (
    'OPENING_BALANCE',
    'PURCHASE_RECEIPT',
    'SALE_ISSUE',
    'SALE_VOID',
    'SALE_RETURN',
    'PURCHASE_VOID',
    'PURCHASE_RETURN',
    'ADJUSTMENT',
    'WASTE'
  ));

-- Keep the cloud posting helper aligned with the TS service: SALE_RETURN is a
-- stock-in movement and should revalue moving average like SALE_VOID.
CREATE OR REPLACE FUNCTION public.inventory_post_movement(
  p_id TEXT,
  p_barang_id TEXT,
  p_tanggal TEXT,
  p_movement_type TEXT,
  p_qty_delta REAL,
  p_unit_cost REAL,
  p_source_type TEXT,
  p_source_id TEXT,
  p_source_line_id TEXT DEFAULT NULL,
  p_reversal_of_id TEXT DEFAULT NULL,
  p_catatan TEXT DEFAULT NULL,
  p_dibuat_oleh TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_barang barang%ROWTYPE;
  v_qty_before REAL;
  v_qty_after REAL;
  v_avg_before REAL;
  v_avg_after REAL;
  v_unit_cost REAL;
  v_value_delta REAL;
BEGIN
  IF p_qty_delta = 0 THEN
    RAISE EXCEPTION 'Qty movement tidak boleh 0';
  END IF;

  SELECT * INTO v_barang
  FROM barang
  WHERE id = p_barang_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barang tidak ditemukan: %', p_barang_id;
  END IF;

  IF COALESCE(v_barang.lacak_inventori_status, 1) = 0 THEN
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'Barang tidak memakai tracking inventori',
      'barang_id', p_barang_id
    );
  END IF;

  v_qty_before := COALESCE(v_barang.jumlah_stok, 0);
  v_avg_before := COALESCE(v_barang.average_cost_per_base_unit, 0);
  v_unit_cost := COALESCE(NULLIF(p_unit_cost, 0), v_avg_before, 0);
  v_qty_after := v_qty_before + p_qty_delta;

  IF v_qty_after < -0.000001 THEN
    RAISE EXCEPTION 'Stok tidak cukup untuk %. Stok tersedia %, diminta %',
      COALESCE(v_barang.nama, p_barang_id), v_qty_before, ABS(p_qty_delta);
  END IF;

  IF ABS(v_qty_after) < 0.000001 THEN
    v_qty_after := 0;
  END IF;

  IF p_movement_type IN (
    'PURCHASE_RECEIPT',
    'SALE_RETURN',
    'SALE_VOID',
    'PURCHASE_VOID',
    'PURCHASE_RETURN',
    'ADJUSTMENT',
    'OPENING_BALANCE'
  ) THEN
    IF v_qty_after > 0 THEN
      v_avg_after := GREATEST(
        0,
        ((v_qty_before * v_avg_before) + (p_qty_delta * v_unit_cost)) / v_qty_after
      );
    ELSE
      v_avg_after := 0;
    END IF;
  ELSE
    v_avg_after := CASE WHEN v_qty_after > 0 THEN v_avg_before ELSE 0 END;
  END IF;

  v_value_delta := p_qty_delta * v_unit_cost;

  INSERT INTO inventory_movements (
    id, barang_id, tanggal, movement_type, qty_delta, unit_cost, value_delta,
    qty_before, qty_after, avg_cost_before, avg_cost_after,
    source_type, source_id, source_line_id, reversal_of_id,
    catatan, dibuat_oleh, updated_at_server, updated_by_device,
    change_version, is_deleted
  ) VALUES (
    p_id, p_barang_id, COALESCE(p_tanggal, CURRENT_DATE::TEXT), p_movement_type,
    p_qty_delta, v_unit_cost, v_value_delta, v_qty_before, v_qty_after,
    v_avg_before, v_avg_after, p_source_type, p_source_id, p_source_line_id,
    p_reversal_of_id, p_catatan, p_dibuat_oleh, NOW(), 'server', 1, 0
  );

  UPDATE barang
  SET jumlah_stok = v_qty_after,
      average_cost_per_base_unit = v_avg_after,
      diperbarui_pada = NOW(),
      updated_at_server = NOW(),
      updated_by_device = 'server',
      change_version = COALESCE(change_version, 0) + 1
  WHERE id = p_barang_id;

  UPDATE harga_barang_satuan
  SET harga_beli = v_avg_after * COALESCE(NULLIF(faktor_konversi, 0), 1),
      diperbarui_pada = NOW(),
      updated_at_server = NOW(),
      updated_by_device = 'server',
      change_version = COALESCE(change_version, 0) + 1
  WHERE barang_id = p_barang_id;

  RETURN jsonb_build_object(
    'id', p_id,
    'barang_id', p_barang_id,
    'qty_before', v_qty_before,
    'qty_after', v_qty_after,
    'avg_cost_before', v_avg_before,
    'avg_cost_after', v_avg_after,
    'unit_cost', v_unit_cost,
    'value_delta', v_value_delta
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Document tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS penawaran (
  id TEXT PRIMARY KEY,
  nomor_penawaran TEXT NOT NULL UNIQUE,
  pelanggan_id TEXT REFERENCES pelanggan(id),
  pelanggan_nama_snapshot TEXT,
  pelanggan_kota TEXT,
  tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
  berlaku_sampai DATE,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK(status IN ('DRAFT','SENT','ACCEPTED','CONVERTED','CANCELLED','EXPIRED')),
  total_jumlah REAL NOT NULL DEFAULT 0,
  kena_ppn INTEGER NOT NULL DEFAULT 0,
  ppn_persen REAL NOT NULL DEFAULT 0,
  ppn_metode TEXT NOT NULL DEFAULT 'EKSKLUSIF'
    CHECK(ppn_metode IN ('EKSKLUSIF','INKLUSIF')),
  dpp_total REAL NOT NULL DEFAULT 0,
  ppn_total REAL NOT NULL DEFAULT 0,
  catatan TEXT,
  dibuat_oleh TEXT REFERENCES profil(id),
  converted_penjualan_id TEXT REFERENCES penjualan(id),
  converted_at TIMESTAMPTZ,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT
);

CREATE TABLE IF NOT EXISTS item_penawaran (
  id TEXT PRIMARY KEY,
  penawaran_id TEXT NOT NULL REFERENCES penawaran(id) ON DELETE CASCADE,
  barang_id TEXT NOT NULL REFERENCES barang(id),
  harga_satuan_id TEXT REFERENCES harga_barang_satuan(id),
  jumlah REAL NOT NULL,
  nama_satuan TEXT NOT NULL,
  faktor_konversi REAL NOT NULL DEFAULT 1,
  harga_satuan REAL NOT NULL,
  subtotal REAL NOT NULL,
  panjang REAL,
  lebar REAL,
  tipe_item TEXT NOT NULL DEFAULT 'BARANG'
    CHECK(tipe_item IN ('BARANG','JASA','MAKLON')),
  vendor_subkontrak_id TEXT REFERENCES vendor(id) ON DELETE SET NULL,
  biaya_subkontrak REAL,
  metode_bayar_vendor TEXT CHECK(metode_bayar_vendor IS NULL OR metode_bayar_vendor IN ('CASH','NET30')),
  deskripsi_pekerjaan TEXT,
  dpp_satuan REAL NOT NULL DEFAULT 0,
  ppn_satuan REAL NOT NULL DEFAULT 0,
  dpp_total REAL NOT NULL DEFAULT 0,
  ppn_total REAL NOT NULL DEFAULT 0,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  nomor_po TEXT NOT NULL UNIQUE,
  vendor_id TEXT REFERENCES vendor(id),
  tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_date DATE,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK(status IN ('DRAFT','SENT','PARTIAL_RECEIVED','RECEIVED','CANCELLED')),
  total_jumlah REAL NOT NULL DEFAULT 0,
  kena_ppn INTEGER NOT NULL DEFAULT 0,
  ppn_persen REAL NOT NULL DEFAULT 0,
  ppn_metode TEXT NOT NULL DEFAULT 'EKSKLUSIF'
    CHECK(ppn_metode IN ('EKSKLUSIF','INKLUSIF')),
  dpp_total REAL NOT NULL DEFAULT 0,
  ppn_total REAL NOT NULL DEFAULT 0,
  catatan TEXT,
  dibuat_oleh TEXT REFERENCES profil(id),
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  barang_id TEXT NOT NULL REFERENCES barang(id),
  harga_satuan_id TEXT REFERENCES harga_barang_satuan(id),
  jumlah REAL NOT NULL,
  qty_received REAL NOT NULL DEFAULT 0,
  nama_satuan TEXT NOT NULL,
  faktor_konversi REAL NOT NULL DEFAULT 1,
  harga_satuan REAL NOT NULL,
  subtotal REAL NOT NULL,
  panjang REAL,
  lebar REAL,
  dpp_satuan REAL NOT NULL DEFAULT 0,
  ppn_satuan REAL NOT NULL DEFAULT 0,
  dpp_total REAL NOT NULL DEFAULT 0,
  ppn_total REAL NOT NULL DEFAULT 0,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT
);

CREATE TABLE IF NOT EXISTS retur_penjualan (
  id TEXT PRIMARY KEY,
  nomor_retur TEXT NOT NULL UNIQUE,
  penjualan_id TEXT NOT NULL REFERENCES penjualan(id),
  tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK(status IN ('POSTED','CANCELLED')),
  total_retur REAL NOT NULL DEFAULT 0,
  dpp_total REAL NOT NULL DEFAULT 0,
  ppn_total REAL NOT NULL DEFAULT 0,
  total_hpp REAL NOT NULL DEFAULT 0,
  receivable_reduction REAL NOT NULL DEFAULT 0,
  refund_amount REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  catatan TEXT,
  dibuat_oleh TEXT REFERENCES profil(id),
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT
);

CREATE TABLE IF NOT EXISTS item_retur_penjualan (
  id TEXT PRIMARY KEY,
  retur_penjualan_id TEXT NOT NULL REFERENCES retur_penjualan(id) ON DELETE CASCADE,
  item_penjualan_id TEXT NOT NULL REFERENCES item_penjualan(id),
  barang_id TEXT NOT NULL REFERENCES barang(id),
  qty REAL NOT NULL,
  qty_base REAL NOT NULL,
  nama_satuan TEXT NOT NULL,
  faktor_konversi REAL NOT NULL DEFAULT 1,
  harga_satuan REAL NOT NULL,
  subtotal REAL NOT NULL,
  hpp_satuan REAL NOT NULL DEFAULT 0,
  hpp_total REAL NOT NULL DEFAULT 0,
  dpp_total REAL NOT NULL DEFAULT 0,
  ppn_total REAL NOT NULL DEFAULT 0,
  movement_id TEXT REFERENCES inventory_movements(id),
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT
);

CREATE TABLE IF NOT EXISTS retur_pembelian (
  id TEXT PRIMARY KEY,
  nomor_retur TEXT NOT NULL UNIQUE,
  pembelian_id TEXT NOT NULL REFERENCES pembelian(id),
  tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK(status IN ('POSTED','CANCELLED')),
  total_retur REAL NOT NULL DEFAULT 0,
  dpp_total REAL NOT NULL DEFAULT 0,
  ppn_total REAL NOT NULL DEFAULT 0,
  debt_reduction REAL NOT NULL DEFAULT 0,
  refund_amount REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  catatan TEXT,
  dibuat_oleh TEXT REFERENCES profil(id),
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT
);

CREATE TABLE IF NOT EXISTS item_retur_pembelian (
  id TEXT PRIMARY KEY,
  retur_pembelian_id TEXT NOT NULL REFERENCES retur_pembelian(id) ON DELETE CASCADE,
  item_pembelian_id TEXT NOT NULL REFERENCES item_pembelian(id),
  barang_id TEXT NOT NULL REFERENCES barang(id),
  qty REAL NOT NULL,
  qty_base REAL NOT NULL,
  nama_satuan TEXT NOT NULL,
  faktor_konversi REAL NOT NULL DEFAULT 1,
  harga_satuan REAL NOT NULL,
  subtotal REAL NOT NULL,
  dpp_total REAL NOT NULL DEFAULT 0,
  ppn_total REAL NOT NULL DEFAULT 0,
  movement_id TEXT REFERENCES inventory_movements(id),
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT
);

CREATE TABLE IF NOT EXISTS stock_opnames (
  id TEXT PRIMARY KEY,
  nomor_opname TEXT NOT NULL UNIQUE,
  tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','POSTED','CANCELLED')),
  catatan TEXT,
  dibuat_oleh TEXT REFERENCES profil(id),
  posted_at TIMESTAMPTZ,
  posted_by TEXT REFERENCES profil(id),
  total_items INTEGER NOT NULL DEFAULT 0,
  total_delta_qty REAL NOT NULL DEFAULT 0,
  total_delta_value REAL NOT NULL DEFAULT 0,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT
);

CREATE TABLE IF NOT EXISTS stock_opname_items (
  id TEXT PRIMARY KEY,
  stock_opname_id TEXT NOT NULL REFERENCES stock_opnames(id) ON DELETE CASCADE,
  barang_id TEXT NOT NULL REFERENCES barang(id),
  system_qty REAL NOT NULL DEFAULT 0,
  counted_qty REAL,
  delta_qty REAL NOT NULL DEFAULT 0,
  unit_cost REAL NOT NULL DEFAULT 0,
  delta_value REAL NOT NULL DEFAULT 0,
  catatan TEXT,
  movement_id TEXT REFERENCES inventory_movements(id),
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT
);

-- ---------------------------------------------------------------------------
-- Indexes, RLS and grants
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_penawaran_status ON penawaran(status, tanggal);
CREATE INDEX IF NOT EXISTS idx_penawaran_pelanggan ON penawaran(pelanggan_id);
CREATE INDEX IF NOT EXISTS idx_item_penawaran_doc ON item_penawaran(penawaran_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status, tanggal);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_doc ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_retur_penjualan_sale ON retur_penjualan(penjualan_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_item_retur_penjualan_doc ON item_retur_penjualan(retur_penjualan_id);
CREATE INDEX IF NOT EXISTS idx_item_retur_penjualan_source ON item_retur_penjualan(item_penjualan_id);
CREATE INDEX IF NOT EXISTS idx_retur_pembelian_purchase ON retur_pembelian(pembelian_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_item_retur_pembelian_doc ON item_retur_pembelian(retur_pembelian_id);
CREATE INDEX IF NOT EXISTS idx_item_retur_pembelian_source ON item_retur_pembelian(item_pembelian_id);
CREATE INDEX IF NOT EXISTS idx_stock_opnames_status ON stock_opnames(status, tanggal);
CREATE INDEX IF NOT EXISTS idx_stock_opname_items_doc ON stock_opname_items(stock_opname_id);
CREATE INDEX IF NOT EXISTS idx_stock_opname_items_barang ON stock_opname_items(barang_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'penjualan_penawaran_id_fkey'
  ) THEN
    ALTER TABLE penjualan
      ADD CONSTRAINT penjualan_penawaran_id_fkey
      FOREIGN KEY (penawaran_id) REFERENCES penawaran(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pembelian_purchase_order_id_fkey'
  ) THEN
    ALTER TABLE pembelian
      ADD CONSTRAINT pembelian_purchase_order_id_fkey
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_pembelian_purchase_order_item_id_fkey'
  ) THEN
    ALTER TABLE item_pembelian
      ADD CONSTRAINT item_pembelian_purchase_order_item_id_fkey
      FOREIGN KEY (purchase_order_item_id) REFERENCES purchase_order_items(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'penawaran',
    'item_penawaran',
    'purchase_orders',
    'purchase_order_items',
    'retur_penjualan',
    'item_retur_penjualan',
    'retur_pembelian',
    'item_retur_pembelian',
    'stock_opnames',
    'stock_opname_items'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS anon_full_access ON public.%I', t);
    EXECUTE format('CREATE POLICY anon_full_access ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true)', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Return finance categories and metric contributions
-- ---------------------------------------------------------------------------
INSERT INTO finance_category_definitions (
  id, category_code, display_name, color_bg, color_text, color_border,
  direction, is_active, display_order, metric_contributions
) VALUES
  (
    'fin-cat-retur-penjualan', 'RETUR_PENJUALAN', 'Retur Penjualan',
    'bg-rose-100', 'text-rose-800', 'border-rose-300',
    'kredit', 1, 32,
    '[{"column":"omzet","amount_field":"kredit","sign":-1}]'::jsonb
  ),
  (
    'fin-cat-retur-hpp', 'RETUR_HPP', 'Retur HPP',
    'bg-slate-100', 'text-slate-800', 'border-slate-300',
    'debit', 1, 76,
    '[{"column":"biaya_bahan","amount_field":"debit","sign":-1}]'::jsonb
  ),
  (
    'fin-cat-retur-pembelian', 'RETUR_PEMBELIAN', 'Retur Pembelian',
    'bg-emerald-100', 'text-emerald-800', 'border-emerald-300',
    'debit', 1, 72,
    '[]'::jsonb
  )
ON CONFLICT (category_code) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  color_bg = EXCLUDED.color_bg,
  color_text = EXCLUDED.color_text,
  color_border = EXCLUDED.color_border,
  direction = EXCLUDED.direction,
  is_active = 1,
  display_order = EXCLUDED.display_order,
  metric_contributions = EXCLUDED.metric_contributions,
  updated_at = NOW();

UPDATE cashbook_formula
SET ast = '{"type":"if","cond":{"type":"or","left":{"type":"or","left":{"type":"not","arg":{"type":"iserror","arg":{"type":"search","find":{"type":"literal","value":"OMZET"},"within":{"type":"columnRef","column":"C"}}}},"right":{"type":"not","arg":{"type":"iserror","arg":{"type":"search","find":{"type":"literal","value":"PIUTANG"},"within":{"type":"columnRef","column":"C"}}}}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_PENJUALAN"}}},"then":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_PENJUALAN"}},"then":{"type":"binaryOp","op":"-","left":{"type":"literal","value":0},"right":{"type":"columnRef","column":"E"}},"else":{"type":"columnRef","column":"D"}},"else":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_PENJUALAN"}},"then":{"type":"binaryOp","op":"-","left":{"type":"prevOutput","column":"G"},"right":{"type":"columnRef","column":"E"}},"else":{"type":"binaryOp","op":"+","left":{"type":"prevOutput","column":"G"},"right":{"type":"columnRef","column":"D"}}}},"else":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"literal","value":0},"else":{"type":"prevOutput","column":"G"}}}'::jsonb,
    description = 'Akumulasi penjualan + piutang dikurangi retur penjualan.'
WHERE column_key = 'G' OR db_column = 'omzet' OR formula_key = 'omzet';

UPDATE cashbook_formula
SET ast = '{"type":"if","cond":{"type":"or","left":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"HPP"}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_HPP"}}},"then":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_HPP"}},"then":{"type":"binaryOp","op":"-","left":{"type":"literal","value":0},"right":{"type":"columnRef","column":"D"}},"else":{"type":"columnRef","column":"E"}},"else":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_HPP"}},"then":{"type":"binaryOp","op":"-","left":{"type":"prevOutput","column":"I"},"right":{"type":"columnRef","column":"D"}},"else":{"type":"binaryOp","op":"+","left":{"type":"prevOutput","column":"I"},"right":{"type":"columnRef","column":"E"}}}},"else":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"literal","value":0},"else":{"type":"prevOutput","column":"I"}}}'::jsonb,
    description = 'Akumulasi HPP dikurangi HPP barang yang diretur.'
WHERE column_key = 'I' OR db_column = 'biaya_bahan' OR formula_key = 'biaya_bahan';

UPDATE cashbook_formula
SET ast = '{"type":"if","cond":{"type":"or","left":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"HPP"}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_HPP"}}},"then":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"literal","value":0},"else":{"type":"prevOutput","column":"J"}},"else":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"binaryOp","op":"-","left":{"type":"columnRef","column":"D"},"right":{"type":"columnRef","column":"E"}},"else":{"type":"binaryOp","op":"-","left":{"type":"binaryOp","op":"+","left":{"type":"prevOutput","column":"J"},"right":{"type":"columnRef","column":"D"}},"right":{"type":"columnRef","column":"E"}}}}'::jsonb,
    description = 'Saldo kas berjalan; HPP dan retur HPP tidak mengubah kas.'
WHERE column_key = 'J' OR db_column = 'saldo' OR formula_key = 'saldo';
