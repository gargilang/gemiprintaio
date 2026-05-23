-- ════════════════════════════════════════════════════════════════════════════
-- Migration: long-term hardening
--   1. Atomic Adjustment + Waste + Retur via Postgres RPC.
--   2. Reference ID di keuangan (reference_type, reference_id) — migrate
--      dari pattern legacy `keperluan LIKE '%[REF:...]%'` ke kolom proper.
--   3. Period close (accounting_periods) + check di RPC void/adjustment/waste.
--   4. Multi-warehouse prep: kolom location_id di inventory_movements dan
--      barang, plus seed lokasi 'main'. UI belum aktif tapi schema siap.
--   5. Update RPC create_purchase + create_sale untuk pass reference fields
--      ke keuangan insert.
--
-- Backwards compatible:
--   - Kolom baru pakai default yang aman ('main' untuk lokasi, NULL untuk
--     reference fields).
--   - Backfill keuangan.reference_id di-derive dari `keperluan LIKE` legacy
--     pattern, jadi finance row historis tetap nyambung ke transaksi.
--   - Period closure cuma block saat ada periode CLOSED yang menutup
--     tanggal target; default belum ada periode CLOSED, jadi behavior
--     persis sama dengan sebelumnya.
-- ════════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- 1. Multi-warehouse prep
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lokasi (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  kode TEXT UNIQUE,
  alamat TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  aktif_status INTEGER NOT NULL DEFAULT 1,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT
);

INSERT INTO lokasi (id, nama, kode, is_default, aktif_status)
VALUES ('main', 'Gudang Utama', 'MAIN', 1, 1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE lokasi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_full_access ON lokasi;
CREATE POLICY anon_full_access ON lokasi
  FOR ALL TO anon USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON lokasi TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON lokasi TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON lokasi TO service_role;

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS location_id TEXT REFERENCES lokasi(id) DEFAULT 'main';
CREATE INDEX IF NOT EXISTS idx_inventory_movements_location
  ON inventory_movements(location_id);

ALTER TABLE barang
  ADD COLUMN IF NOT EXISTS default_location_id TEXT REFERENCES lokasi(id) DEFAULT 'main';

-- ---------------------------------------------------------------------------
-- 2. Reference fields di keuangan
-- ---------------------------------------------------------------------------
ALTER TABLE keuangan
  ADD COLUMN IF NOT EXISTS reference_type TEXT,
  ADD COLUMN IF NOT EXISTS reference_id TEXT;

CREATE INDEX IF NOT EXISTS idx_keuangan_reference
  ON keuangan(reference_type, reference_id);

-- Backfill from legacy [REF:...] pattern. Pattern: `... [REF:<uuid>]` di akhir
-- atau di tengah keperluan. Kita extract pakai regex.
UPDATE keuangan
SET reference_id = SUBSTRING(keperluan FROM '\[REF:([^\]]+)\]'),
    reference_type = CASE
      WHEN keperluan ILIKE '%pembelian%' OR keperluan ILIKE '%hutang%' THEN 'PURCHASE'
      WHEN keperluan ILIKE '%maklon%' THEN 'PURCHASE_MAKLON'
      WHEN keperluan ILIKE '%piutang%' THEN 'SALE_RECEIVABLE'
      WHEN keperluan ILIKE '%hpp%' OR keperluan ILIKE '%omzet%' OR keperluan ILIKE '%inv-%' THEN 'SALE'
      ELSE 'OTHER'
    END
WHERE reference_id IS NULL
  AND keperluan ~ '\[REF:[^\]]+\]';

-- ---------------------------------------------------------------------------
-- 3. Period close
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting_periods (
  id TEXT PRIMARY KEY,
  -- "YYYY-MM" string. Unique karena satu bulan satu periode.
  period_key TEXT NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'CLOSED')),
  closed_at TIMESTAMPTZ,
  closed_by TEXT REFERENCES profil(id),
  catatan TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_status
  ON accounting_periods(status, start_date, end_date);

ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_full_access ON accounting_periods;
CREATE POLICY anon_full_access ON accounting_periods
  FOR ALL TO anon USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting_periods TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting_periods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting_periods TO service_role;

-- Helper: throw kalau tanggal target jatuh dalam periode CLOSED.
-- Dipakai oleh RPC void/adjustment/waste/retur.
CREATE OR REPLACE FUNCTION public.assert_period_open(p_tanggal DATE)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_period_key TEXT;
  v_status TEXT;
BEGIN
  IF p_tanggal IS NULL THEN
    RETURN;
  END IF;
  v_period_key := TO_CHAR(p_tanggal, 'YYYY-MM');
  SELECT status INTO v_status
  FROM accounting_periods
  WHERE period_key = v_period_key
  LIMIT 1;
  IF v_status = 'CLOSED' THEN
    RAISE EXCEPTION 'Periode % sudah ditutup. Gunakan jurnal pembalik di periode berjalan.', v_period_key;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_period_open(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_period_open(DATE) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Atomic Adjustment / Waste / Retur RPCs
-- ---------------------------------------------------------------------------

-- Adjustment stok: bungkus inventory_post_movement dengan validasi alasan
-- dan period guard. Atomic karena pl/pgsql di-jalankan dalam satu transaction.
CREATE OR REPLACE FUNCTION public.apply_inventory_adjustment(
  p_id TEXT,
  p_barang_id TEXT,
  p_qty_delta REAL,
  p_reason TEXT,
  p_unit_cost REAL DEFAULT NULL,
  p_tanggal DATE DEFAULT NULL,
  p_actor_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tanggal DATE := COALESCE(p_tanggal, CURRENT_DATE);
BEGIN
  IF p_qty_delta = 0 THEN
    RAISE EXCEPTION 'Qty adjustment tidak boleh 0';
  END IF;
  IF COALESCE(TRIM(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Alasan adjustment stok wajib diisi';
  END IF;

  PERFORM public.assert_period_open(v_tanggal);

  RETURN public.inventory_post_movement(
    p_id,
    p_barang_id,
    v_tanggal::TEXT,
    'ADJUSTMENT',
    p_qty_delta,
    COALESCE(p_unit_cost, 0),
    'ADJUSTMENT',
    p_id,
    NULL,
    NULL,
    TRIM(p_reason),
    p_actor_id
  );
END;
$$;

-- Waste: pengurangan stok karena material rusak / scrap.
-- AVCO tidak di-revalue (sama pattern dengan SALE_ISSUE), supaya cost
-- sisa stok tetap stabil dan biaya scrap tercatat di value_delta.
CREATE OR REPLACE FUNCTION public.apply_inventory_waste(
  p_id TEXT,
  p_barang_id TEXT,
  p_qty REAL,
  p_reason TEXT,
  p_tanggal DATE DEFAULT NULL,
  p_actor_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tanggal DATE := COALESCE(p_tanggal, CURRENT_DATE);
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Jumlah material rusak harus lebih dari 0';
  END IF;
  IF COALESCE(TRIM(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Alasan/keterangan material rusak wajib diisi';
  END IF;

  PERFORM public.assert_period_open(v_tanggal);

  RETURN public.inventory_post_movement(
    p_id,
    p_barang_id,
    v_tanggal::TEXT,
    'WASTE',
    -p_qty,
    0, -- pakai avg cost current (handled di inventory_post_movement)
    'WASTE',
    p_id,
    NULL,
    NULL,
    TRIM(p_reason),
    p_actor_id
  );
END;
$$;

-- Retur Vendor: kembalikan sebagian (atau seluruh) qty ke vendor.
-- Pembelian tetap POSTED, hanya stok yang dikurangi dengan unit_cost dari
-- movement asli (PURCHASE_RECEIPT).
CREATE OR REPLACE FUNCTION public.apply_purchase_return(
  p_purchase_id TEXT,
  p_reason TEXT,
  p_actor_id TEXT,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  p pembelian%ROWTYPE;
  it JSONB;
  v_item item_pembelian%ROWTYPE;
  v_orig inventory_movements%ROWTYPE;
  v_qty_req REAL;
  v_qty_base REAL;
  v_unit_cost REAL;
  v_total_value REAL := 0;
  v_tanggal DATE := CURRENT_DATE;
BEGIN
  IF COALESCE(TRIM(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Alasan retur wajib diisi';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Minimal satu line untuk retur';
  END IF;

  PERFORM public.assert_period_open(v_tanggal);

  SELECT * INTO p FROM pembelian WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pembelian tidak ditemukan';
  END IF;
  IF COALESCE(p.status_transaksi, 'POSTED') = 'VOIDED' THEN
    RAISE EXCEPTION 'Pembelian sudah dibatalkan, tidak bisa di-retur';
  END IF;

  FOR it IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_qty_req := COALESCE((it->>'qty')::REAL, 0);
    IF v_qty_req <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_item
    FROM item_pembelian
    WHERE id = it->>'item_pembelian_id'
      AND pembelian_id = p_purchase_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item pembelian % tidak ditemukan', it->>'item_pembelian_id';
    END IF;

    SELECT * INTO v_orig
    FROM inventory_movements
    WHERE source_type = 'PURCHASE'
      AND source_id = p_purchase_id
      AND source_line_id = v_item.id
      AND movement_type = 'PURCHASE_RECEIPT'
    ORDER BY dibuat_pada DESC
    LIMIT 1;

    v_qty_base := v_qty_req * COALESCE(NULLIF(v_item.faktor_konversi, 0), 1);
    IF v_orig.id IS NOT NULL
      AND v_qty_base > ABS(COALESCE(v_orig.qty_delta, 0)) + 0.000001 THEN
      RAISE EXCEPTION 'Retur %: qty melebihi qty pembelian', v_item.id;
    END IF;
    v_unit_cost := CASE
      WHEN v_orig.id IS NOT NULL THEN COALESCE(v_orig.unit_cost, 0)
      ELSE COALESCE(v_item.harga_satuan, 0) /
           COALESCE(NULLIF(v_item.faktor_konversi, 0), 1)
    END;

    PERFORM public.inventory_post_movement(
      'ret-' || v_item.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT,
      v_item.barang_id,
      v_tanggal::TEXT,
      'PURCHASE_RETURN',
      -v_qty_base,
      v_unit_cost,
      'PURCHASE_RETURN',
      p_purchase_id,
      v_item.id,
      v_orig.id,
      'Retur ke vendor: ' || TRIM(p_reason),
      p_actor_id
    );

    v_total_value := v_total_value + v_qty_base * v_unit_cost;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'purchase_id', p_purchase_id,
    'total_retur_value', v_total_value
  );
END;
$$;

-- Period close handling di RPC void existing — tambah guard tanpa rewrite
-- dengan wrapping check sebelum proses lain berjalan.
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

  -- Period guard: cek tanggal pembelian asli (bukan tanggal void), karena
  -- void berdampak ke laporan periode tanggal pembelian.
  PERFORM public.assert_period_open(p.tanggal);

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

  -- Sebelum migration ini, void cari finance row pakai keperluan LIKE.
  -- Sekarang prefer reference_id (kolom proper); fallback tetap LIKE supaya
  -- transaksi pre-migration masih ke-handle.
  UPDATE keuangan
  SET status_transaksi = 'VOIDED',
      voided_at = NOW(),
      voided_by = actor_id,
      void_reason = reason,
      diperbarui_pada = NOW()
  WHERE COALESCE(status_transaksi, 'POSTED') <> 'VOIDED'
    AND (
      reference_id = purchase_id
      OR COALESCE(keperluan, '') LIKE '%[REF:' || purchase_id || ']%'
    );

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
  v_period_date DATE;
BEGIN
  SELECT * INTO s FROM penjualan WHERE id = sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Penjualan tidak ditemukan';
  END IF;
  IF COALESCE(s.status_transaksi, 'POSTED') = 'VOIDED' THEN
    RAISE EXCEPTION 'Penjualan sudah dibatalkan';
  END IF;

  v_period_date := s.dibuat_pada::DATE;
  PERFORM public.assert_period_open(v_period_date);

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
    AND (
      reference_id = sale_id
      OR COALESCE(keperluan, '') LIKE '%[REF:' || sale_id || ']%'
    );

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

REVOKE EXECUTE ON FUNCTION public.apply_inventory_adjustment(
  TEXT, TEXT, REAL, TEXT, REAL, DATE, TEXT
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_inventory_waste(
  TEXT, TEXT, REAL, TEXT, DATE, TEXT
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_purchase_return(
  TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.apply_inventory_adjustment(
  TEXT, TEXT, REAL, TEXT, REAL, DATE, TEXT
) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_inventory_waste(
  TEXT, TEXT, REAL, TEXT, DATE, TEXT
) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_purchase_return(
  TEXT, TEXT, TEXT, JSONB
) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Update RPC create_purchase + create_sale untuk write reference fields
--    ke keuangan. Sama dengan migrasi PPN sebelumnya, hanya dengan tambahan
--    reference_type + reference_id di INSERT keuangan, dan pass period guard
--    di awal.
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
  v_kena_ppn INTEGER := COALESCE((p->>'kena_ppn')::INTEGER, 0);
  v_ppn_persen REAL := COALESCE((p->>'ppn_persen')::REAL, 0);
  v_ppn_metode TEXT := COALESCE(p->>'ppn_metode', 'EKSKLUSIF');
  v_dapat_dikreditkan INTEGER := COALESCE((p->>'dapat_dikreditkan')::INTEGER, 1);
  v_total REAL := COALESCE((p->>'total_jumlah')::REAL, 0);
  v_breakdown JSONB;
  v_dpp_total REAL := v_total;
  v_ppn_total REAL := 0;
  v_line_subtotal REAL;
  v_line_breakdown JSONB;
  v_line_dpp_total REAL;
  v_line_ppn_total REAL;
  v_line_dpp_satuan REAL;
  v_line_ppn_satuan REAL;
  v_tanggal DATE := COALESCE((p->>'tanggal')::DATE, CURRENT_DATE);
BEGIN
  -- Period guard.
  PERFORM public.assert_period_open(v_tanggal);

  IF v_kena_ppn = 1 AND v_ppn_persen > 0 THEN
    v_breakdown := public.hitung_ppn(v_total, v_ppn_persen, v_ppn_metode);
    v_dpp_total := (v_breakdown->>'dpp')::REAL;
    v_ppn_total := (v_breakdown->>'ppn')::REAL;
  END IF;

  INSERT INTO pembelian (
    id, nomor_pembelian, nomor_faktur, vendor_id, tanggal,
    metode_pembayaran, total_jumlah, jumlah_dibayar, status_pembayaran,
    catatan, dibuat_oleh, diterima_oleh, tipe_pembelian,
    penjualan_id_sumber, status_transaksi,
    kena_ppn, ppn_persen, ppn_metode, dpp_total, ppn_total,
    dapat_dikreditkan, nomor_faktur_pajak_vendor, tanggal_faktur_pajak,
    vendor_npwp_snapshot
  ) VALUES (
    purchase_id, p->>'nomor_pembelian', p->>'nomor_faktur',
    NULLIF(p->>'vendor_id', ''), COALESCE(p->>'tanggal', CURRENT_DATE::TEXT),
    p->>'metode_pembayaran', v_total,
    COALESCE((p->>'jumlah_dibayar')::REAL, 0), p->>'status_pembayaran',
    NULLIF(p->>'catatan', ''), NULLIF(p->>'dibuat_oleh', ''),
    NULLIF(p->>'diterima_oleh', ''), COALESCE(p->>'tipe_pembelian', 'BARANG'),
    NULLIF(p->>'penjualan_id_sumber', ''), 'POSTED',
    v_kena_ppn, v_ppn_persen, v_ppn_metode, v_dpp_total, v_ppn_total,
    v_dapat_dikreditkan, NULLIF(p->>'nomor_faktur_pajak_vendor', ''),
    NULLIF(p->>'tanggal_faktur_pajak', '')::DATE,
    NULLIF(p->>'vendor_npwp_snapshot', '')
  );

  FOR item IN SELECT value FROM jsonb_array_elements(payload->'items') LOOP
    item_id := item->>'id';

    v_line_subtotal := COALESCE((item->>'subtotal')::REAL, 0);
    IF v_kena_ppn = 1 AND v_ppn_persen > 0 THEN
      v_line_breakdown := public.hitung_ppn(v_line_subtotal, v_ppn_persen, v_ppn_metode);
      v_line_dpp_total := (v_line_breakdown->>'dpp')::REAL;
      v_line_ppn_total := (v_line_breakdown->>'ppn')::REAL;
    ELSE
      v_line_dpp_total := v_line_subtotal;
      v_line_ppn_total := 0;
    END IF;
    v_line_dpp_satuan := CASE
      WHEN COALESCE((item->>'jumlah')::REAL, 0) <> 0
        THEN v_line_dpp_total / (item->>'jumlah')::REAL
      ELSE 0
    END;
    v_line_ppn_satuan := CASE
      WHEN COALESCE((item->>'jumlah')::REAL, 0) <> 0
        THEN v_line_ppn_total / (item->>'jumlah')::REAL
      ELSE 0
    END;

    INSERT INTO item_pembelian (
      id, pembelian_id, barang_id, harga_satuan_id, nama_satuan,
      faktor_konversi, jumlah, harga_satuan, subtotal, panjang, lebar,
      dpp_satuan, ppn_satuan, dpp_total, ppn_total
    ) VALUES (
      item_id, purchase_id, item->>'barang_id', NULLIF(item->>'harga_satuan_id', ''),
      COALESCE(item->>'nama_satuan', ''), COALESCE((item->>'faktor_konversi')::REAL, 1),
      COALESCE((item->>'jumlah')::REAL, 0), COALESCE((item->>'harga_satuan')::REAL, 0),
      v_line_subtotal, NULLIF(item->>'panjang', '')::REAL,
      NULLIF(item->>'lebar', '')::REAL,
      v_line_dpp_satuan, v_line_ppn_satuan, v_line_dpp_total, v_line_ppn_total
    );

    IF COALESCE(p->>'tipe_pembelian', 'BARANG') = 'BARANG' THEN
      qty_base := COALESCE((item->>'jumlah')::REAL, 0) * COALESCE(NULLIF((item->>'faktor_konversi')::REAL, 0), 1);
      unit_cost := CASE
        WHEN qty_base <> 0 THEN v_line_dpp_total / qty_base
        ELSE 0
      END;
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
      dibuat_pada, diperbarui_pada, reference_type, reference_id
    ) VALUES (
      finance->>'id', finance->>'tanggal', finance->>'kategori_transaksi',
      COALESCE((finance->>'debit')::REAL, 0), COALESCE((finance->>'kredit')::REAL, 0),
      finance->>'keperluan', COALESCE((finance->>'omzet')::REAL, 0),
      COALESCE((finance->>'biaya_bahan')::REAL, 0), NULLIF(finance->>'catatan', ''),
      NULLIF(finance->>'dibuat_oleh', ''), COALESCE((finance->>'urutan_tampilan')::INTEGER, 0),
      'POSTED', NOW(), NOW(),
      COALESCE(finance->>'reference_type', 'PURCHASE'),
      COALESCE(finance->>'reference_id', purchase_id)
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

  RETURN jsonb_build_object(
    'id', purchase_id,
    'dpp_total', v_dpp_total,
    'ppn_total', v_ppn_total,
    'total_jumlah', v_total
  );
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
  v_kena_ppn INTEGER := COALESCE((s->>'kena_ppn')::INTEGER, 0);
  v_ppn_persen REAL := COALESCE((s->>'ppn_persen')::REAL, 0);
  v_ppn_metode TEXT := COALESCE(s->>'ppn_metode', 'EKSKLUSIF');
  v_total REAL := COALESCE((s->>'total_jumlah')::REAL, 0);
  v_breakdown JSONB;
  v_dpp_total REAL := v_total;
  v_ppn_total REAL := 0;
  v_line_subtotal REAL;
  v_line_breakdown JSONB;
  v_line_dpp_total REAL;
  v_line_ppn_total REAL;
  v_line_dpp_satuan REAL;
  v_line_ppn_satuan REAL;
  v_tanggal DATE := COALESCE((s->>'tanggal')::DATE, CURRENT_DATE);
BEGIN
  PERFORM public.assert_period_open(v_tanggal);

  IF v_kena_ppn = 1 AND v_ppn_persen > 0 THEN
    v_breakdown := public.hitung_ppn(v_total, v_ppn_persen, v_ppn_metode);
    v_dpp_total := (v_breakdown->>'dpp')::REAL;
    v_ppn_total := (v_breakdown->>'ppn')::REAL;
  END IF;

  INSERT INTO penjualan (
    id, nomor_invoice, pelanggan_id, pelanggan_nama_snapshot, pelanggan_kota,
    total_jumlah, jumlah_dibayar, jumlah_kembalian, metode_pembayaran,
    kasir_id, catatan, status_transaksi,
    kena_ppn, ppn_persen, ppn_metode, dpp_total, ppn_total,
    nsfp_kode_transaksi, nsfp_tahun, nsfp_nomor_seri, tanggal_faktur_pajak,
    pelanggan_npwp_snapshot, pelanggan_alamat_npwp_snapshot,
    pelanggan_nama_npwp_snapshot
  ) VALUES (
    sale_id, s->>'nomor_invoice', NULLIF(s->>'pelanggan_id', ''),
    NULLIF(s->>'pelanggan_nama_snapshot', ''), NULLIF(s->>'pelanggan_kota', ''),
    v_total, COALESCE((s->>'jumlah_dibayar')::REAL, 0),
    COALESCE((s->>'jumlah_kembalian')::REAL, 0), s->>'metode_pembayaran',
    NULLIF(s->>'kasir_id', ''), NULLIF(s->>'catatan', ''), 'POSTED',
    v_kena_ppn, v_ppn_persen, v_ppn_metode, v_dpp_total, v_ppn_total,
    NULLIF(s->>'nsfp_kode_transaksi', ''),
    NULLIF(s->>'nsfp_tahun', ''),
    NULLIF(s->>'nsfp_nomor_seri', ''),
    NULLIF(s->>'tanggal_faktur_pajak', '')::DATE,
    NULLIF(s->>'pelanggan_npwp_snapshot', ''),
    NULLIF(s->>'pelanggan_alamat_npwp_snapshot', ''),
    NULLIF(s->>'pelanggan_nama_npwp_snapshot', '')
  );

  IF v_kena_ppn = 1
    AND s->>'nsfp_nomor_seri' IS NOT NULL
    AND s->>'nsfp_tahun' IS NOT NULL
    AND s->>'nsfp_kode_transaksi' IS NOT NULL THEN
    UPDATE nsfp_pool
    SET status = 'TERPAKAI',
        penjualan_id = sale_id,
        diperbarui_pada = NOW()
    WHERE tahun = s->>'nsfp_tahun'
      AND kode_transaksi = s->>'nsfp_kode_transaksi'
      AND nomor_seri = s->>'nsfp_nomor_seri'
      AND status = 'TERSEDIA';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(payload->'items') LOOP
    item_id := item->>'id';
    hpp_satuan := COALESCE((item->>'hpp_satuan')::REAL, 0);
    hpp_total := COALESCE((item->>'hpp_total')::REAL, 0);

    v_line_subtotal := COALESCE((item->>'subtotal')::REAL, 0);
    IF v_kena_ppn = 1 AND v_ppn_persen > 0 THEN
      v_line_breakdown := public.hitung_ppn(v_line_subtotal, v_ppn_persen, v_ppn_metode);
      v_line_dpp_total := (v_line_breakdown->>'dpp')::REAL;
      v_line_ppn_total := (v_line_breakdown->>'ppn')::REAL;
    ELSE
      v_line_dpp_total := v_line_subtotal;
      v_line_ppn_total := 0;
    END IF;
    v_line_dpp_satuan := CASE
      WHEN COALESCE((item->>'jumlah')::REAL, 0) <> 0
        THEN v_line_dpp_total / (item->>'jumlah')::REAL
      ELSE 0
    END;
    v_line_ppn_satuan := CASE
      WHEN COALESCE((item->>'jumlah')::REAL, 0) <> 0
        THEN v_line_ppn_total / (item->>'jumlah')::REAL
      ELSE 0
    END;

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
      pembelian_id_terkait, deskripsi_pekerjaan,
      dpp_satuan, ppn_satuan, dpp_total, ppn_total
    ) VALUES (
      item_id, sale_id, item->>'barang_id', NULLIF(item->>'harga_satuan_id', ''),
      COALESCE((item->>'jumlah')::REAL, 0), COALESCE(item->>'nama_satuan', ''),
      COALESCE((item->>'faktor_konversi')::REAL, 1), COALESCE((item->>'harga_satuan')::REAL, 0),
      v_line_subtotal, hpp_satuan, hpp_total,
      v_line_dpp_total - hpp_total,
      CASE WHEN v_line_dpp_total > 0
        THEN ((v_line_dpp_total - hpp_total) / v_line_dpp_total) * 100
        ELSE 0 END,
      NULLIF(item->>'panjang', '')::REAL, NULLIF(item->>'lebar', '')::REAL,
      COALESCE(item->>'tipe_item', 'BARANG'), NULLIF(item->>'vendor_subkontrak_id', ''),
      NULLIF(item->>'biaya_subkontrak', '')::REAL, NULLIF(item->>'metode_bayar_vendor', ''),
      NULLIF(item->>'pembelian_id_terkait', ''), NULLIF(item->>'deskripsi_pekerjaan', ''),
      v_line_dpp_satuan, v_line_ppn_satuan, v_line_dpp_total, v_line_ppn_total
    );
  END LOOP;

  FOR finance IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'finance_entries', '[]'::jsonb)) LOOP
    INSERT INTO keuangan (
      id, tanggal, kategori_transaksi, debit, kredit, keperluan, omzet,
      biaya_bahan, catatan, dibuat_oleh, urutan_tampilan, status_transaksi,
      dibuat_pada, diperbarui_pada, reference_type, reference_id
    ) VALUES (
      finance->>'id', finance->>'tanggal', finance->>'kategori_transaksi',
      COALESCE((finance->>'debit')::REAL, 0), COALESCE((finance->>'kredit')::REAL, 0),
      finance->>'keperluan', COALESCE((finance->>'omzet')::REAL, 0),
      COALESCE((finance->>'biaya_bahan')::REAL, 0), NULLIF(finance->>'catatan', ''),
      NULLIF(finance->>'dibuat_oleh', ''), COALESCE((finance->>'urutan_tampilan')::INTEGER, 0),
      'POSTED', NOW(), NOW(),
      COALESCE(finance->>'reference_type', 'SALE'),
      COALESCE(finance->>'reference_id', sale_id)
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

  RETURN jsonb_build_object(
    'id', sale_id,
    'nomor_invoice', s->>'nomor_invoice',
    'spk_number', COALESCE(prod->>'nomor_spk', ''),
    'dpp_total', v_dpp_total,
    'ppn_total', v_ppn_total,
    'total_jumlah', v_total
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_purchase_with_inventory(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_sale_with_inventory(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_purchase_with_inventory(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_sale_with_inventory(JSONB) TO service_role;
