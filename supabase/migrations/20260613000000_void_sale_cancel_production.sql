-- ════════════════════════════════════════════════════════════════════════════
-- Migration: void_sale_with_inventory — ikut batalkan SPK (order_produksi)
--
-- BUG: saat penjualan ber-MAKLON di-void dari Riwayat Penjualan, SPK
-- (order_produksi) yang dibuat createSale TIDAK ikut dibatalkan. Penjualan
-- hanya di-soft-void (status_transaksi='VOIDED'), tidak DIHAPUS, jadi FK
-- ON DELETE CASCADE pada order_produksi.penjualan_id tidak pernah jalan.
-- Akibatnya SPK tetap nongol di /produksi/spk dengan status MENUNGGU.
--
-- FIX: setelah lolos guard produksi (yang menolak void bila ada SPK
-- PROSES/PRINTING/FINISHING/SELESAI), tandai SPK MENUNGGU yang tersisa +
-- semua itemnya sebagai DIBATALKAN. Soft-cancel, konsisten dengan cara void
-- men-soft-void penjualan/keuangan (bukan hard delete) demi jejak audit.
--
-- Idempoten: hanya menyentuh baris yang belum DIBATALKAN/SELESAI.
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

  -- Batalkan SPK (order_produksi) yang dibuat penjualan ini beserta itemnya.
  -- Guard di atas sudah menolak void bila ada SPK PROSES/PRINTING/FINISHING/
  -- SELESAI, jadi di sini yang tersisa hanya MENUNGGU/DIBATALKAN. Soft-cancel
  -- (tandai DIBATALKAN) konsisten dengan soft-void penjualan/keuangan.
  UPDATE item_produksi ip
  SET status = 'DIBATALKAN',
      diperbarui_pada = NOW()
  FROM order_produksi op
  WHERE ip.order_produksi_id = op.id
    AND op.penjualan_id = sale_id
    AND COALESCE(ip.status, 'MENUNGGU') NOT IN ('DIBATALKAN', 'SELESAI');

  UPDATE order_produksi
  SET status = 'DIBATALKAN',
      diperbarui_pada = NOW()
  WHERE penjualan_id = sale_id
    AND COALESCE(status, 'MENUNGGU') NOT IN ('DIBATALKAN', 'SELESAI');

  RETURN jsonb_build_object('id', sale_id, 'status_transaksi', 'VOIDED');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.void_sale_with_inventory(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_sale_with_inventory(TEXT, TEXT, TEXT) TO service_role;
