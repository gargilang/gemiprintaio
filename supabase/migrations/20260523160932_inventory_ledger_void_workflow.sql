-- Inventory Ledger + Void Workflow
--
-- Long-term invariant:
--   barang.jumlah_stok and barang.average_cost_per_base_unit are cached
--   balances. Every business stock change must have an append-only row in
--   inventory_movements.

-- ---------------------------------------------------------------------------
-- Posted document lifecycle
-- ---------------------------------------------------------------------------

ALTER TABLE pembelian
  ADD COLUMN IF NOT EXISTS status_transaksi TEXT NOT NULL DEFAULT 'POSTED'
    CHECK (status_transaksi IN ('DRAFT', 'POSTED', 'VOIDED')),
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by TEXT,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

ALTER TABLE penjualan
  ADD COLUMN IF NOT EXISTS status_transaksi TEXT NOT NULL DEFAULT 'POSTED'
    CHECK (status_transaksi IN ('DRAFT', 'POSTED', 'VOIDED')),
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by TEXT,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

ALTER TABLE keuangan
  ADD COLUMN IF NOT EXISTS status_transaksi TEXT NOT NULL DEFAULT 'POSTED'
    CHECK (status_transaksi IN ('POSTED', 'VOIDED')),
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by TEXT,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_pembelian_status_transaksi ON pembelian(status_transaksi);
CREATE INDEX IF NOT EXISTS idx_penjualan_status_transaksi ON penjualan(status_transaksi);
CREATE INDEX IF NOT EXISTS idx_keuangan_status_transaksi ON keuangan(status_transaksi);

-- ---------------------------------------------------------------------------
-- Inventory movement ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  barang_id TEXT NOT NULL REFERENCES barang(id),
  tanggal TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (
    movement_type IN (
      'OPENING_BALANCE',
      'PURCHASE_RECEIPT',
      'SALE_ISSUE',
      'SALE_VOID',
      'PURCHASE_VOID',
      'PURCHASE_RETURN',
      'ADJUSTMENT'
    )
  ),
  qty_delta REAL NOT NULL,
  unit_cost REAL NOT NULL DEFAULT 0,
  value_delta REAL NOT NULL DEFAULT 0,
  qty_before REAL NOT NULL DEFAULT 0,
  qty_after REAL NOT NULL DEFAULT 0,
  avg_cost_before REAL NOT NULL DEFAULT 0,
  avg_cost_after REAL NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_line_id TEXT,
  reversal_of_id TEXT REFERENCES inventory_movements(id),
  catatan TEXT,
  dibuat_oleh TEXT REFERENCES profil(id),
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

CREATE INDEX IF NOT EXISTS idx_inventory_movements_barang ON inventory_movements(barang_id, dibuat_pada);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_source ON inventory_movements(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_line ON inventory_movements(source_line_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_sync_status ON inventory_movements(sync_status);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_updated_at_server ON inventory_movements(updated_at_server);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_change_version ON inventory_movements(change_version);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_is_deleted ON inventory_movements(is_deleted);

ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_full_access ON inventory_movements;
CREATE POLICY anon_full_access ON inventory_movements
  FOR ALL TO anon USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON inventory_movements TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON inventory_movements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON inventory_movements TO service_role;

-- Existing dev data becomes one opening-balance movement per tracked item.
INSERT INTO inventory_movements (
  id, barang_id, tanggal, movement_type, qty_delta, unit_cost, value_delta,
  qty_before, qty_after, avg_cost_before, avg_cost_after,
  source_type, source_id, source_line_id, catatan, dibuat_oleh,
  updated_at_server, updated_by_device, change_version, is_deleted
)
SELECT
  'opening-' || b.id,
  b.id,
  COALESCE(CAST(b.dibuat_pada AS TEXT), CURRENT_DATE::TEXT),
  'OPENING_BALANCE',
  COALESCE(b.jumlah_stok, 0),
  COALESCE(b.average_cost_per_base_unit, 0),
  COALESCE(b.jumlah_stok, 0) * COALESCE(b.average_cost_per_base_unit, 0),
  0,
  COALESCE(b.jumlah_stok, 0),
  0,
  COALESCE(b.average_cost_per_base_unit, 0),
  'OPENING_BALANCE',
  b.id,
  NULL,
  'Saldo awal otomatis dari stok barang sebelum inventory ledger aktif',
  NULL,
  NOW(),
  'migration',
  1,
  0
FROM barang b
WHERE COALESCE(b.lacak_inventori_status, 1) <> 0
  AND COALESCE(b.jumlah_stok, 0) <> 0
  AND NOT EXISTS (
    SELECT 1 FROM inventory_movements im
    WHERE im.id = 'opening-' || b.id
  );

-- ---------------------------------------------------------------------------
-- Inventory posting helpers
-- ---------------------------------------------------------------------------

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

  IF p_movement_type IN ('PURCHASE_RECEIPT', 'PURCHASE_VOID', 'SALE_VOID', 'PURCHASE_RETURN', 'ADJUSTMENT', 'OPENING_BALANCE') THEN
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
-- RPC entrypoints used by the web app
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_purchase_with_inventory(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  p JSONB := payload->'purchase';
  item JSONB;
  finance JSONB;
  debt JSONB;
  purchase_id TEXT := p->>'id';
  item_id TEXT;
  qty_base REAL;
  unit_cost REAL;
BEGIN
  INSERT INTO pembelian (
    id, nomor_pembelian, nomor_faktur, vendor_id, tanggal,
    metode_pembayaran, total_jumlah, jumlah_dibayar, status_pembayaran,
    catatan, dibuat_oleh, diterima_oleh, tipe_pembelian,
    penjualan_id_sumber, status_transaksi
  ) VALUES (
    purchase_id, p->>'nomor_pembelian', p->>'nomor_faktur',
    NULLIF(p->>'vendor_id', ''), COALESCE(p->>'tanggal', CURRENT_DATE::TEXT),
    p->>'metode_pembayaran', COALESCE((p->>'total_jumlah')::REAL, 0),
    COALESCE((p->>'jumlah_dibayar')::REAL, 0), p->>'status_pembayaran',
    NULLIF(p->>'catatan', ''), NULLIF(p->>'dibuat_oleh', ''),
    NULLIF(p->>'diterima_oleh', ''), COALESCE(p->>'tipe_pembelian', 'BARANG'),
    NULLIF(p->>'penjualan_id_sumber', ''), 'POSTED'
  );

  FOR item IN SELECT value FROM jsonb_array_elements(payload->'items') LOOP
    item_id := item->>'id';
    INSERT INTO item_pembelian (
      id, pembelian_id, barang_id, harga_satuan_id, nama_satuan,
      faktor_konversi, jumlah, harga_satuan, subtotal, panjang, lebar
    ) VALUES (
      item_id, purchase_id, item->>'barang_id', NULLIF(item->>'harga_satuan_id', ''),
      COALESCE(item->>'nama_satuan', ''), COALESCE((item->>'faktor_konversi')::REAL, 1),
      COALESCE((item->>'jumlah')::REAL, 0), COALESCE((item->>'harga_satuan')::REAL, 0),
      COALESCE((item->>'subtotal')::REAL, 0), NULLIF(item->>'panjang', '')::REAL,
      NULLIF(item->>'lebar', '')::REAL
    );

    IF COALESCE(p->>'tipe_pembelian', 'BARANG') = 'BARANG' THEN
      qty_base := COALESCE((item->>'jumlah')::REAL, 0) * COALESCE(NULLIF((item->>'faktor_konversi')::REAL, 0), 1);
      unit_cost := COALESCE((item->>'harga_satuan')::REAL, 0) / COALESCE(NULLIF((item->>'faktor_konversi')::REAL, 0), 1);
      PERFORM public.inventory_post_movement(
        COALESCE(item->>'movement_id', 'mov-' || item_id),
        item->>'barang_id',
        COALESCE(p->>'tanggal', CURRENT_DATE::TEXT),
        'PURCHASE_RECEIPT',
        qty_base,
        unit_cost,
        'PURCHASE',
        purchase_id,
        item_id,
        NULL,
        'Penerimaan pembelian ' || COALESCE(p->>'nomor_faktur', p->>'nomor_pembelian'),
        NULLIF(p->>'dibuat_oleh', '')
      );
    END IF;
  END LOOP;

  finance := payload->'finance';
  IF finance IS NOT NULL AND finance <> 'null'::jsonb THEN
    INSERT INTO keuangan (
      id, tanggal, kategori_transaksi, debit, kredit, keperluan, omzet,
      biaya_bahan, catatan, dibuat_oleh, urutan_tampilan, status_transaksi,
      dibuat_pada, diperbarui_pada
    ) VALUES (
      finance->>'id', finance->>'tanggal', finance->>'kategori_transaksi',
      COALESCE((finance->>'debit')::REAL, 0), COALESCE((finance->>'kredit')::REAL, 0),
      finance->>'keperluan', COALESCE((finance->>'omzet')::REAL, 0),
      COALESCE((finance->>'biaya_bahan')::REAL, 0), NULLIF(finance->>'catatan', ''),
      NULLIF(finance->>'dibuat_oleh', ''), COALESCE((finance->>'urutan_tampilan')::INTEGER, 0),
      'POSTED', NOW(), NOW()
    );
  END IF;

  debt := payload->'debt';
  IF debt IS NOT NULL AND debt <> 'null'::jsonb THEN
    INSERT INTO hutang_pembelian (
      id, id_pembelian, jumlah_hutang, jumlah_terbayar, sisa_hutang,
      jatuh_tempo, status, catatan
    ) VALUES (
      debt->>'id', purchase_id, COALESCE((debt->>'jumlah_hutang')::REAL, 0),
      COALESCE((debt->>'jumlah_terbayar')::REAL, 0),
      COALESCE((debt->>'sisa_hutang')::REAL, 0), NULLIF(debt->>'jatuh_tempo', ''),
      COALESCE(debt->>'status', 'AKTIF'), NULLIF(debt->>'catatan', '')
    );
  END IF;

  RETURN jsonb_build_object('id', purchase_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_sale_with_inventory(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  s JSONB := payload->'sale';
  item JSONB;
  finance JSONB;
  receivable JSONB;
  prod JSONB;
  prod_item JSONB;
  finishing JSONB;
  sale_id TEXT := s->>'id';
  item_id TEXT;
  qty_base REAL;
  avg_cost REAL;
  hpp_satuan REAL;
  hpp_total REAL;
  movement_result JSONB;
BEGIN
  INSERT INTO penjualan (
    id, nomor_invoice, pelanggan_id, pelanggan_nama_snapshot, pelanggan_kota,
    total_jumlah, jumlah_dibayar, jumlah_kembalian, metode_pembayaran,
    kasir_id, catatan, status_transaksi
  ) VALUES (
    sale_id, s->>'nomor_invoice', NULLIF(s->>'pelanggan_id', ''),
    NULLIF(s->>'pelanggan_nama_snapshot', ''), NULLIF(s->>'pelanggan_kota', ''),
    COALESCE((s->>'total_jumlah')::REAL, 0), COALESCE((s->>'jumlah_dibayar')::REAL, 0),
    COALESCE((s->>'jumlah_kembalian')::REAL, 0), s->>'metode_pembayaran',
    NULLIF(s->>'kasir_id', ''), NULLIF(s->>'catatan', ''), 'POSTED'
  );

  FOR item IN SELECT value FROM jsonb_array_elements(payload->'items') LOOP
    item_id := item->>'id';
    hpp_satuan := COALESCE((item->>'hpp_satuan')::REAL, 0);
    hpp_total := COALESCE((item->>'hpp_total')::REAL, 0);

    IF COALESCE(item->>'tipe_item', 'BARANG') = 'BARANG' THEN
      SELECT COALESCE(average_cost_per_base_unit, 0)
      INTO avg_cost
      FROM barang
      WHERE id = item->>'barang_id'
      FOR UPDATE;

      qty_base := COALESCE((item->>'jumlah')::REAL, 0) * COALESCE(NULLIF((item->>'faktor_konversi')::REAL, 0), 1);
      hpp_satuan := avg_cost * COALESCE(NULLIF((item->>'faktor_konversi')::REAL, 0), 1);
      hpp_total := hpp_satuan * COALESCE((item->>'jumlah')::REAL, 0);

      movement_result := public.inventory_post_movement(
        COALESCE(item->>'movement_id', 'mov-' || item_id),
        item->>'barang_id',
        COALESCE(s->>'tanggal', CURRENT_DATE::TEXT),
        'SALE_ISSUE',
        -qty_base,
        avg_cost,
        'SALE',
        sale_id,
        item_id,
        NULL,
        'Penjualan ' || COALESCE(s->>'nomor_invoice', sale_id),
        NULLIF(s->>'kasir_id', '')
      );
    END IF;

    INSERT INTO item_penjualan (
      id, penjualan_id, barang_id, harga_satuan_id, jumlah, nama_satuan,
      faktor_konversi, harga_satuan, subtotal, hpp_satuan, hpp_total,
      gross_profit, gross_margin, panjang, lebar, tipe_item,
      vendor_subkontrak_id, biaya_subkontrak, metode_bayar_vendor,
      pembelian_id_terkait, deskripsi_pekerjaan
    ) VALUES (
      item_id, sale_id, item->>'barang_id', NULLIF(item->>'harga_satuan_id', ''),
      COALESCE((item->>'jumlah')::REAL, 0), COALESCE(item->>'nama_satuan', ''),
      COALESCE((item->>'faktor_konversi')::REAL, 1), COALESCE((item->>'harga_satuan')::REAL, 0),
      COALESCE((item->>'subtotal')::REAL, 0), hpp_satuan, hpp_total,
      COALESCE((item->>'subtotal')::REAL, 0) - hpp_total,
      CASE WHEN COALESCE((item->>'subtotal')::REAL, 0) > 0
        THEN ((COALESCE((item->>'subtotal')::REAL, 0) - hpp_total) / COALESCE((item->>'subtotal')::REAL, 0)) * 100
        ELSE 0 END,
      NULLIF(item->>'panjang', '')::REAL, NULLIF(item->>'lebar', '')::REAL,
      COALESCE(item->>'tipe_item', 'BARANG'), NULLIF(item->>'vendor_subkontrak_id', ''),
      NULLIF(item->>'biaya_subkontrak', '')::REAL, NULLIF(item->>'metode_bayar_vendor', ''),
      NULLIF(item->>'pembelian_id_terkait', ''), NULLIF(item->>'deskripsi_pekerjaan', '')
    );
  END LOOP;

  FOR finance IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'finance_entries', '[]'::jsonb)) LOOP
    INSERT INTO keuangan (
      id, tanggal, kategori_transaksi, debit, kredit, keperluan, omzet,
      biaya_bahan, catatan, dibuat_oleh, urutan_tampilan, status_transaksi,
      dibuat_pada, diperbarui_pada
    ) VALUES (
      finance->>'id', finance->>'tanggal', finance->>'kategori_transaksi',
      COALESCE((finance->>'debit')::REAL, 0), COALESCE((finance->>'kredit')::REAL, 0),
      finance->>'keperluan', COALESCE((finance->>'omzet')::REAL, 0),
      COALESCE((finance->>'biaya_bahan')::REAL, 0), NULLIF(finance->>'catatan', ''),
      NULLIF(finance->>'dibuat_oleh', ''), COALESCE((finance->>'urutan_tampilan')::INTEGER, 0),
      'POSTED', NOW(), NOW()
    );
  END LOOP;

  receivable := payload->'receivable';
  IF receivable IS NOT NULL AND receivable <> 'null'::jsonb THEN
    INSERT INTO piutang_penjualan (
      id, id_penjualan, jumlah_piutang, jumlah_terbayar, sisa_piutang,
      jatuh_tempo, status, catatan
    ) VALUES (
      receivable->>'id', sale_id, COALESCE((receivable->>'jumlah_piutang')::REAL, 0),
      COALESCE((receivable->>'jumlah_terbayar')::REAL, 0),
      COALESCE((receivable->>'sisa_piutang')::REAL, 0),
      NULLIF(receivable->>'jatuh_tempo', ''), COALESCE(receivable->>'status', 'AKTIF'),
      NULLIF(receivable->>'catatan', '')
    );
  END IF;

  prod := payload->'production_order';
  IF prod IS NOT NULL AND prod <> 'null'::jsonb THEN
    INSERT INTO order_produksi (
      id, penjualan_id, nomor_spk, pelanggan_nama, total_item,
      status, prioritas, catatan, dibuat_oleh
    ) VALUES (
      prod->>'id', sale_id, prod->>'nomor_spk', NULLIF(prod->>'pelanggan_nama', ''),
      COALESCE((prod->>'total_item')::INTEGER, 0), COALESCE(prod->>'status', 'MENUNGGU'),
      COALESCE(prod->>'prioritas', 'NORMAL'), NULLIF(prod->>'catatan', ''),
      NULLIF(prod->>'dibuat_oleh', '')
    );
  END IF;

  FOR prod_item IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'production_items', '[]'::jsonb)) LOOP
    INSERT INTO item_produksi (
      id, order_produksi_id, item_penjualan_id, barang_nama, jumlah,
      nama_satuan, panjang, lebar, status
    ) VALUES (
      prod_item->>'id', prod_item->>'order_produksi_id', prod_item->>'item_penjualan_id',
      prod_item->>'barang_nama', COALESCE((prod_item->>'jumlah')::REAL, 0),
      prod_item->>'nama_satuan', NULLIF(prod_item->>'panjang', '')::REAL,
      NULLIF(prod_item->>'lebar', '')::REAL, COALESCE(prod_item->>'status', 'MENUNGGU')
    );

    FOR finishing IN SELECT value FROM jsonb_array_elements(COALESCE(prod_item->'finishing', '[]'::jsonb)) LOOP
      INSERT INTO item_finishing (
        id, item_produksi_id, jenis_finishing, keterangan, status
      ) VALUES (
        finishing->>'id', prod_item->>'id', finishing->>'jenis_finishing',
        NULLIF(finishing->>'keterangan', ''), COALESCE(finishing->>'status', 'MENUNGGU')
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('id', sale_id, 'nomor_invoice', s->>'nomor_invoice', 'spk_number', COALESCE(prod->>'nomor_spk', ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.void_purchase_with_inventory(
  purchase_id TEXT,
  reason TEXT,
  actor_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  p pembelian%ROWTYPE;
  item item_pembelian%ROWTYPE;
  movement inventory_movements%ROWTYPE;
  payment_count INTEGER;
BEGIN
  SELECT * INTO p FROM pembelian WHERE id = purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pembelian tidak ditemukan';
  END IF;
  IF COALESCE(p.status_transaksi, 'POSTED') = 'VOIDED' THEN
    RAISE EXCEPTION 'Pembelian sudah dibatalkan';
  END IF;

  SELECT COUNT(*) INTO payment_count
  FROM hutang_pembelian h
  JOIN pelunasan_hutang ph ON ph.id_hutang = h.id
  WHERE h.id_pembelian = purchase_id;
  IF payment_count > 0 THEN
    RAISE EXCEPTION 'Pembelian sudah memiliki pembayaran tagihan. Revert pembayaran dulu sebelum membatalkan pembelian.';
  END IF;

  FOR item IN SELECT * FROM item_pembelian WHERE pembelian_id = purchase_id LOOP
    SELECT * INTO movement
    FROM inventory_movements
    WHERE source_type = 'PURCHASE'
      AND source_id = purchase_id
      AND source_line_id = item.id
      AND movement_type = 'PURCHASE_RECEIPT'
    ORDER BY dibuat_pada DESC
    LIMIT 1;

    IF FOUND THEN
      PERFORM public.inventory_post_movement(
        'void-' || movement.id,
        item.barang_id,
        CURRENT_DATE::TEXT,
        'PURCHASE_VOID',
        -ABS(movement.qty_delta),
        movement.unit_cost,
        'PURCHASE_VOID',
        purchase_id,
        item.id,
        movement.id,
        COALESCE(reason, 'Pembelian dibatalkan'),
        actor_id
      );
    END IF;
  END LOOP;

  UPDATE pembelian
  SET status_transaksi = 'VOIDED',
      voided_at = NOW(),
      voided_by = actor_id,
      void_reason = reason,
      diperbarui_pada = NOW()
  WHERE id = purchase_id;

  UPDATE keuangan
  SET status_transaksi = 'VOIDED',
      voided_at = NOW(),
      voided_by = actor_id,
      void_reason = reason,
      diperbarui_pada = NOW()
  WHERE COALESCE(status_transaksi, 'POSTED') <> 'VOIDED'
    AND COALESCE(keperluan, '') LIKE '%[REF:' || purchase_id || ']%';

  UPDATE hutang_pembelian
  SET jumlah_terbayar = 0,
      sisa_hutang = 0,
      status = 'LUNAS',
      catatan = COALESCE(catatan, '') || ' (Pembelian dibatalkan)',
      diperbarui_pada = NOW()
  WHERE id_pembelian = purchase_id;

  RETURN jsonb_build_object('id', purchase_id, 'status_transaksi', 'VOIDED');
END;
$$;

CREATE OR REPLACE FUNCTION public.void_sale_with_inventory(
  sale_id TEXT,
  reason TEXT,
  actor_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  s penjualan%ROWTYPE;
  item item_penjualan%ROWTYPE;
  movement inventory_movements%ROWTYPE;
  payment_count INTEGER;
BEGIN
  SELECT * INTO s FROM penjualan WHERE id = sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Penjualan tidak ditemukan';
  END IF;
  IF COALESCE(s.status_transaksi, 'POSTED') = 'VOIDED' THEN
    RAISE EXCEPTION 'Penjualan sudah dibatalkan';
  END IF;

  SELECT COUNT(*) INTO payment_count
  FROM piutang_penjualan pp
  JOIN pelunasan_piutang ppi ON ppi.id_piutang = pp.id
  WHERE pp.id_penjualan = sale_id;
  IF payment_count > 0 THEN
    RAISE EXCEPTION 'Penjualan sudah memiliki pelunasan piutang. Revert pembayaran dulu sebelum membatalkan transaksi.';
  END IF;

  FOR item IN SELECT * FROM item_penjualan WHERE penjualan_id = sale_id LOOP
    IF COALESCE(item.tipe_item, 'BARANG') IN ('MAKLON', 'JASA') THEN
      CONTINUE;
    END IF;

    SELECT * INTO movement
    FROM inventory_movements
    WHERE source_type = 'SALE'
      AND source_id = sale_id
      AND source_line_id = item.id
      AND movement_type = 'SALE_ISSUE'
    ORDER BY dibuat_pada DESC
    LIMIT 1;

    IF FOUND THEN
      PERFORM public.inventory_post_movement(
        'void-' || movement.id,
        item.barang_id,
        CURRENT_DATE::TEXT,
        'SALE_VOID',
        ABS(movement.qty_delta),
        movement.unit_cost,
        'SALE_VOID',
        sale_id,
        item.id,
        movement.id,
        COALESCE(reason, 'Penjualan dibatalkan'),
        actor_id
      );
    END IF;
  END LOOP;

  UPDATE penjualan
  SET status_transaksi = 'VOIDED',
      voided_at = NOW(),
      voided_by = actor_id,
      void_reason = reason,
      diperbarui_pada = NOW()
  WHERE id = sale_id;

  UPDATE keuangan
  SET status_transaksi = 'VOIDED',
      voided_at = NOW(),
      voided_by = actor_id,
      void_reason = reason,
      diperbarui_pada = NOW()
  WHERE COALESCE(status_transaksi, 'POSTED') <> 'VOIDED'
    AND COALESCE(keperluan, '') LIKE '%[REF:' || sale_id || ']%';

  UPDATE piutang_penjualan
  SET jumlah_terbayar = 0,
      sisa_piutang = 0,
      status = 'LUNAS',
      catatan = COALESCE(catatan, '') || ' (Penjualan dibatalkan)',
      diperbarui_pada = NOW()
  WHERE id_penjualan = sale_id;

  RETURN jsonb_build_object('id', sale_id, 'status_transaksi', 'VOIDED');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.inventory_post_movement(
  TEXT, TEXT, TEXT, TEXT, REAL, REAL, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_purchase_with_inventory(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_sale_with_inventory(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.void_purchase_with_inventory(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.void_sale_with_inventory(TEXT, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.inventory_post_movement(
  TEXT, TEXT, TEXT, TEXT, REAL, REAL, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_purchase_with_inventory(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_sale_with_inventory(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.void_purchase_with_inventory(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.void_sale_with_inventory(TEXT, TEXT, TEXT) TO service_role;
