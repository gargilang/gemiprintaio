-- ════════════════════════════════════════════════════════════════════════════
-- Migration: patch void_sale_with_inventory — tambah cek status produksi
--
-- Sebelumnya RPC hanya cek pelunasan_piutang. Sekarang juga cek apakah
-- ada order_produksi dengan status PROSES/PRINTING/FINISHING/SELESAI.
-- Kalau ada, throw error dengan nomor SPK spesifik supaya operator tahu
-- harus ke mana dulu.
--
-- Konsisten dengan SQLite/Tauri path di pos-service.ts yang sudah punya
-- cek yang sama.
-- ════════════════════════════════════════════════════════════════════════════

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
  v_blocking_spk TEXT;
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

  -- Cek status produksi. Kalau ada SPK yang sudah PROSES/SELESAI, void
  -- ditolak dengan menyebut nomor SPK spesifik supaya operator tahu
  -- harus ke mana dulu.
  SELECT STRING_AGG(nomor_spk || ' (' || status || ')', ', ')
  INTO v_blocking_spk
  FROM order_produksi
  WHERE penjualan_id = sale_id
    AND status IN ('PROSES', 'PRINTING', 'FINISHING', 'SELESAI');

  IF v_blocking_spk IS NOT NULL THEN
    RAISE EXCEPTION
      'Tidak bisa dibatalkan. Penjualan ini sudah masuk produksi: %. Batalkan atau selesaikan SPK tersebut dulu sebelum membatalkan penjualan.',
      v_blocking_spk;
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

REVOKE EXECUTE ON FUNCTION public.void_sale_with_inventory(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_sale_with_inventory(TEXT, TEXT, TEXT) TO service_role;
