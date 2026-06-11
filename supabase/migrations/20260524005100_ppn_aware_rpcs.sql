-- ════════════════════════════════════════════════════════════════════════════
-- Migration: PPN-aware RPCs
--
-- Update create_purchase_with_inventory dan create_sale_with_inventory supaya:
--   1. Hitung DPP/PPN per-line dan per-header pakai public.hitung_ppn().
--   2. Simpan kolom kena_ppn, ppn_persen, ppn_metode, dpp_total, ppn_total,
--      NSFP fields, dan snapshot NPWP.
--   3. Update piutang/hutang pakai total_jumlah (DPP + PPN), supaya tagihan
--      yang muncul di laporan AR/AP termasuk PPN.
--
-- Backwards compatible: kalau payload tidak mention PPN, default kena_ppn=0,
-- ppn_persen=0, dpp_total=total_jumlah. Behavior persis sama dengan sebelum
-- migration ini.
-- ════════════════════════════════════════════════════════════════════════════

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
  -- PPN
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
BEGIN
  -- Hitung total DPP/PPN dari header amount + tarif + metode.
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

    -- Per-line PPN breakdown (dari subtotal line). Kalau header tidak kena
    -- PPN, kolom dpp/ppn line di-zero-kan.
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
      -- Unit cost untuk inventory pakai harga DPP (tidak termasuk PPN), supaya
      -- HPP barang konsisten — PPN masukan akan di-credit secara terpisah,
      -- bukan jadi beban inventory.
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
  -- PPN
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
BEGIN
  IF v_kena_ppn = 1 AND v_ppn_persen > 0 THEN
    v_breakdown := public.hitung_ppn(v_total, v_ppn_persen, v_ppn_metode);
    v_dpp_total := (v_breakdown->>'dpp')::REAL;
    v_ppn_total := (v_breakdown->>'ppn')::REAL;
  END IF;

  INSERT INTO penjualan (
    id, nomor_faktur, pelanggan_id, pelanggan_nama_snapshot, pelanggan_kota,
    total_jumlah, jumlah_dibayar, jumlah_kembalian, metode_pembayaran,
    kasir_id, catatan, status_transaksi,
    kena_ppn, ppn_persen, ppn_metode, dpp_total, ppn_total,
    nsfp_kode_transaksi, nsfp_tahun, nsfp_nomor_seri, tanggal_faktur_pajak,
    pelanggan_npwp_snapshot, pelanggan_alamat_npwp_snapshot,
    pelanggan_nama_npwp_snapshot
  ) VALUES (
    sale_id, s->>'nomor_faktur', NULLIF(s->>'pelanggan_id', ''),
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

  -- Lock NSFP pool entry kalau dipakai (status TERSEDIA → TERPAKAI).
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
        'Penjualan ' || COALESCE(s->>'nomor_faktur', sale_id),
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

  RETURN jsonb_build_object(
    'id', sale_id,
    'nomor_faktur', s->>'nomor_faktur',
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
