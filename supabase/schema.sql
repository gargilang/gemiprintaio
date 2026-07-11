


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;




ALTER SCHEMA "public" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."apply_inventory_adjustment"("p_id" "text", "p_barang_id" "text", "p_qty_delta" real, "p_reason" "text", "p_unit_cost" real DEFAULT NULL::real, "p_tanggal" "date" DEFAULT NULL::"date", "p_actor_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."apply_inventory_adjustment"("p_id" "text", "p_barang_id" "text", "p_qty_delta" real, "p_reason" "text", "p_unit_cost" real, "p_tanggal" "date", "p_actor_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_inventory_waste"("p_id" "text", "p_barang_id" "text", "p_qty" real, "p_reason" "text", "p_tanggal" "date" DEFAULT NULL::"date", "p_actor_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."apply_inventory_waste"("p_id" "text", "p_barang_id" "text", "p_qty" real, "p_reason" "text", "p_tanggal" "date", "p_actor_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_purchase_return"("p_purchase_id" "text", "p_reason" "text", "p_actor_id" "text", "p_items" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."apply_purchase_return"("p_purchase_id" "text", "p_reason" "text", "p_actor_id" "text", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assert_period_open"("p_tanggal" "date") RETURNS "void"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."assert_period_open"("p_tanggal" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_purchase_with_inventory"("payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."create_purchase_with_inventory"("payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_sale_with_inventory"("payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
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
    'nomor_faktur', s->>'nomor_faktur',
    'spk_number', COALESCE(prod->>'nomor_spk', ''),
    'dpp_total', v_dpp_total,
    'ppn_total', v_ppn_total,
    'total_jumlah', v_total
  );
END;
$$;


ALTER FUNCTION "public"."create_sale_with_inventory"("payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hitung_ppn"("amount" real, "tarif" real, "metode" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_dpp REAL;
  v_ppn REAL;
  v_total REAL;
  v_tarif REAL := COALESCE(tarif, 0);
BEGIN
  IF amount IS NULL OR amount = 0 OR v_tarif <= 0 THEN
    RETURN jsonb_build_object('dpp', COALESCE(amount, 0), 'ppn', 0, 'total', COALESCE(amount, 0));
  END IF;

  IF UPPER(COALESCE(metode, 'EKSKLUSIF')) = 'INKLUSIF' THEN
    v_dpp := ROUND((amount / (1 + v_tarif / 100))::NUMERIC, 2);
    v_ppn := ROUND((amount - v_dpp)::NUMERIC, 2);
    v_total := amount;
  ELSE
    v_dpp := amount;
    v_ppn := ROUND((amount * v_tarif / 100)::NUMERIC, 2);
    v_total := v_dpp + v_ppn;
  END IF;

  RETURN jsonb_build_object('dpp', v_dpp, 'ppn', v_ppn, 'total', v_total);
END;
$$;


ALTER FUNCTION "public"."hitung_ppn"("amount" real, "tarif" real, "metode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_post_movement"("p_id" "text", "p_barang_id" "text", "p_tanggal" "text", "p_movement_type" "text", "p_qty_delta" real, "p_unit_cost" real, "p_source_type" "text", "p_source_id" "text", "p_source_line_id" "text" DEFAULT NULL::"text", "p_reversal_of_id" "text" DEFAULT NULL::"text", "p_catatan" "text" DEFAULT NULL::"text", "p_dibuat_oleh" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."inventory_post_movement"("p_id" "text", "p_barang_id" "text", "p_tanggal" "text", "p_movement_type" "text", "p_qty_delta" real, "p_unit_cost" real, "p_source_type" "text", "p_source_id" "text", "p_source_line_id" "text", "p_reversal_of_id" "text", "p_catatan" "text", "p_dibuat_oleh" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_diperbarui_pada"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.diperbarui_pada = NOW();
  NEW.sync_status = 'pending';
  NEW.sync_version = OLD.sync_version + 1;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_diperbarui_pada"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."void_purchase_with_inventory"("purchase_id" "text", "reason" "text", "actor_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."void_purchase_with_inventory"("purchase_id" "text", "reason" "text", "actor_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."void_sale_with_inventory"("sale_id" "text", "reason" "text", "actor_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
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

  -- Lepas NSFP yang terkunci ke penjualan ini (TERPAKAI -> TERSEDIA), konsisten
  -- dengan compensateFailedSale. Faktur pajak batal => nomor seri bisa dipakai lagi.
  UPDATE nsfp_pool
  SET status = 'TERSEDIA',
      penjualan_id = NULL,
      diperbarui_pada = NOW()
  WHERE penjualan_id = sale_id
    AND status = 'TERPAKAI';

  RETURN jsonb_build_object('id', sale_id, 'status_transaksi', 'VOIDED');
END;
$$;


ALTER FUNCTION "public"."void_sale_with_inventory"("sale_id" "text", "reason" "text", "actor_id" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."accounting_periods" (
    "id" "text" NOT NULL,
    "period_key" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "status" "text" DEFAULT 'OPEN'::"text" NOT NULL,
    "closed_at" timestamp with time zone,
    "closed_by" "text",
    "catatan" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    CONSTRAINT "accounting_periods_status_check" CHECK (("status" = ANY (ARRAY['OPEN'::"text", 'CLOSED'::"text"]))),
    CONSTRAINT "accounting_periods_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."accounting_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."accounting_posting_rules" (
    "id" "text" NOT NULL,
    "company_id" "text" NOT NULL,
    "source_type" "text" NOT NULL,
    "rule_name" "text" NOT NULL,
    "debit_account_code" "text" NOT NULL,
    "credit_account_code" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."accounting_posting_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text",
    "action" "text" NOT NULL,
    "resource_type" "text",
    "resource_id" "text",
    "details" "jsonb",
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."barang" (
    "id" "text" NOT NULL,
    "nama" "text" NOT NULL,
    "deskripsi" "text",
    "kategori_id" "text",
    "subkategori_id" "text",
    "satuan_dasar" "text" NOT NULL,
    "spesifikasi" "text",
    "jumlah_stok" double precision DEFAULT 0,
    "average_cost_per_base_unit" double precision DEFAULT 0,
    "level_stok_minimum" double precision DEFAULT 0,
    "lacak_inventori_status" integer DEFAULT 1,
    "butuh_dimensi_status" integer DEFAULT 0,
    "default_location_id" "text" DEFAULT 'main'::"text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "frekuensi_terjual" integer DEFAULT 0,
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "roll_inventory_status" integer DEFAULT 0 NOT NULL,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "barang_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."barang" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."barang_roll_variants" (
    "id" "text" NOT NULL,
    "barang_id" "text" NOT NULL,
    "lebar_m" double precision NOT NULL,
    "panjang_tersedia_m" double precision DEFAULT 0 NOT NULL,
    "average_cost_per_m2" double precision DEFAULT 0 NOT NULL,
    "aktif_status" integer DEFAULT 1 NOT NULL,
    "catatan" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone,
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" integer DEFAULT 1,
    "is_deleted" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "barang_roll_variants_length_nonnegative" CHECK (("panjang_tersedia_m" >= (0)::double precision)),
    CONSTRAINT "barang_roll_variants_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"]))),
    CONSTRAINT "barang_roll_variants_width_positive" CHECK (("lebar_m" > (0)::double precision))
);


ALTER TABLE "public"."barang_roll_variants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."biaya_tambahan_penjualan" (
    "id" "text" NOT NULL,
    "penjualan_id" "text" NOT NULL,
    "label" "text" NOT NULL,
    "nominal" numeric DEFAULT 0 NOT NULL,
    "modal" numeric DEFAULT 0 NOT NULL,
    "urutan" integer DEFAULT 0 NOT NULL,
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone,
    "updated_by_device" "text" DEFAULT 'server'::"text",
    CONSTRAINT "biaya_tambahan_penjualan_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."biaya_tambahan_penjualan" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chart_of_accounts" (
    "id" "text" NOT NULL,
    "company_id" "text" NOT NULL,
    "account_code" "text" NOT NULL,
    "account_name" "text" NOT NULL,
    "account_type" "text" NOT NULL,
    "normal_balance" "text" NOT NULL,
    "parent_account_id" "text",
    "allow_manual_posting" boolean DEFAULT true NOT NULL,
    "is_system_account" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_cash_account" boolean DEFAULT false NOT NULL,
    "cash_flow_group" "text",
    CONSTRAINT "chart_of_accounts_account_type_check" CHECK (("account_type" = ANY (ARRAY['asset'::"text", 'liability'::"text", 'equity'::"text", 'revenue'::"text", 'expense'::"text"]))),
    CONSTRAINT "chart_of_accounts_cash_flow_group_check" CHECK (("cash_flow_group" = ANY (ARRAY['operating'::"text", 'investing'::"text", 'financing'::"text", 'non_cash'::"text"]))),
    CONSTRAINT "chart_of_accounts_normal_balance_check" CHECK (("normal_balance" = ANY (ARRAY['debit'::"text", 'credit'::"text"])))
);


ALTER TABLE "public"."chart_of_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" "text" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "base_currency" "text" DEFAULT 'IDR'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "dibuat_pada" timestamp with time zone DEFAULT "now"() NOT NULL,
    "diperbarui_pada" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."device_registry" (
    "device_id" "text" NOT NULL,
    "device_type" "text" NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb",
    CONSTRAINT "device_registry_device_type_check" CHECK (("device_type" = ANY (ARRAY['web'::"text", 'tauri'::"text", 'server'::"text"])))
);


ALTER TABLE "public"."device_registry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_category_definitions" (
    "id" "text" NOT NULL,
    "category_code" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "color_bg" "text" DEFAULT 'bg-gray-100'::"text" NOT NULL,
    "color_text" "text" DEFAULT 'text-gray-800'::"text" NOT NULL,
    "color_border" "text" DEFAULT 'border-gray-300'::"text" NOT NULL,
    "direction" "text" DEFAULT 'both'::"text" NOT NULL,
    "is_active" integer DEFAULT 1 NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone,
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" integer DEFAULT 1,
    "is_deleted" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    "metric_contributions" "jsonb",
    CONSTRAINT "finance_category_definitions_direction_check" CHECK (("direction" = ANY (ARRAY['debit'::"text", 'kredit'::"text", 'both'::"text"]))),
    CONSTRAINT "finance_category_definitions_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."finance_category_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_metric_column_rules" (
    "id" "text" NOT NULL,
    "column_name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "rule_type" "text" DEFAULT 'accumulator'::"text" NOT NULL,
    "formula_expression" "text",
    "kasbon_conditions" "jsonb",
    "is_system" integer DEFAULT 0 NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "finance_metric_column_rules_rule_type_check" CHECK (("rule_type" = ANY (ARRAY['saldo'::"text", 'accumulator'::"text", 'formula'::"text", 'kasbon_conditional'::"text", 'profit_share'::"text"])))
);


ALTER TABLE "public"."finance_metric_column_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_metric_mappings" (
    "id" "text" NOT NULL,
    "metric_key" "text" NOT NULL,
    "metric_label" "text" NOT NULL,
    "metric_group" "text" NOT NULL,
    "source_column" "text" NOT NULL,
    "participant_id" "text",
    "is_active" integer DEFAULT 1 NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone,
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" integer DEFAULT 1,
    "is_deleted" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "finance_metric_mappings_metric_group_check" CHECK (("metric_group" = ANY (ARRAY['summary'::"text", 'profit_share'::"text", 'cash_advance'::"text"]))),
    CONSTRAINT "finance_metric_mappings_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."finance_metric_mappings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fiscal_periods" (
    "id" "text" NOT NULL,
    "company_id" "text" NOT NULL,
    "period_name" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "is_closed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fiscal_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."harga_barang_satuan" (
    "id" "text" NOT NULL,
    "barang_id" "text" NOT NULL,
    "nama_satuan" "text" NOT NULL,
    "faktor_konversi" double precision NOT NULL,
    "harga_beli" double precision DEFAULT 0,
    "harga_jual" double precision DEFAULT 0,
    "harga_member" double precision DEFAULT 0,
    "default_status" integer DEFAULT 0,
    "urutan_tampilan" integer DEFAULT 0,
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "harga_barang_satuan_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."harga_barang_satuan" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hutang_pembelian" (
    "id" "text" NOT NULL,
    "id_pembelian" "text" NOT NULL,
    "jumlah_hutang" double precision NOT NULL,
    "jumlah_terbayar" double precision DEFAULT 0,
    "sisa_hutang" double precision NOT NULL,
    "jatuh_tempo" "text",
    "status" "text" DEFAULT 'AKTIF'::"text",
    "catatan" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "hutang_pembelian_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'LUNAS'::"text", 'JATUH_TEMPO'::"text"]))),
    CONSTRAINT "hutang_pembelian_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."hutang_pembelian" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_movements" (
    "id" "text" NOT NULL,
    "barang_id" "text" NOT NULL,
    "tanggal" "text" NOT NULL,
    "movement_type" "text" NOT NULL,
    "qty_delta" double precision NOT NULL,
    "unit_cost" double precision DEFAULT 0 NOT NULL,
    "value_delta" double precision DEFAULT 0 NOT NULL,
    "qty_before" double precision DEFAULT 0 NOT NULL,
    "qty_after" double precision DEFAULT 0 NOT NULL,
    "avg_cost_before" double precision DEFAULT 0 NOT NULL,
    "avg_cost_after" double precision DEFAULT 0 NOT NULL,
    "source_type" "text" NOT NULL,
    "source_id" "text" NOT NULL,
    "source_line_id" "text",
    "reversal_of_id" "text",
    "catatan" "text",
    "dibuat_oleh" "text",
    "location_id" "text" DEFAULT 'main'::"text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone,
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" integer DEFAULT 1,
    "is_deleted" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    "roll_variant_id" "text",
    "roll_width_m" double precision,
    "linear_delta_m" double precision,
    CONSTRAINT "inventory_movements_movement_type_check" CHECK (("movement_type" = ANY (ARRAY['OPENING_BALANCE'::"text", 'PURCHASE_RECEIPT'::"text", 'SALE_ISSUE'::"text", 'SALE_VOID'::"text", 'SALE_RETURN'::"text", 'PURCHASE_VOID'::"text", 'PURCHASE_RETURN'::"text", 'ADJUSTMENT'::"text", 'WASTE'::"text", 'ROLL_CONVERSION_OUT'::"text", 'ROLL_CONVERSION_IN'::"text", 'PRODUCTION_ISSUE'::"text", 'PRODUCTION_WASTE'::"text"]))),
    CONSTRAINT "inventory_movements_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."inventory_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."item_finishing" (
    "id" "text" NOT NULL,
    "item_produksi_id" "text" NOT NULL,
    "jenis_finishing" "text" NOT NULL,
    "keterangan" "text",
    "status" "text" DEFAULT 'MENUNGGU'::"text",
    "operator_id" "text",
    "mulai_proses" "text",
    "selesai_proses" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "item_finishing_status_check" CHECK (("status" = ANY (ARRAY['MENUNGGU'::"text", 'PROSES'::"text", 'SELESAI'::"text"]))),
    CONSTRAINT "item_finishing_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."item_finishing" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."item_pembelian" (
    "id" "text" NOT NULL,
    "pembelian_id" "text" NOT NULL,
    "barang_id" "text" NOT NULL,
    "harga_satuan_id" "text",
    "jumlah" double precision NOT NULL,
    "nama_satuan" "text" NOT NULL,
    "faktor_konversi" double precision NOT NULL,
    "harga_satuan" double precision NOT NULL,
    "subtotal" double precision NOT NULL,
    "panjang" double precision,
    "lebar" double precision,
    "dpp_satuan" double precision DEFAULT 0 NOT NULL,
    "ppn_satuan" double precision DEFAULT 0 NOT NULL,
    "dpp_total" double precision DEFAULT 0 NOT NULL,
    "ppn_total" double precision DEFAULT 0 NOT NULL,
    "purchase_order_item_id" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "jumlah_roll" integer DEFAULT 1 NOT NULL,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "item_pembelian_jumlah_roll_check" CHECK (("jumlah_roll" >= 1)),
    CONSTRAINT "item_pembelian_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."item_pembelian" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."item_penawaran" (
    "id" "text" NOT NULL,
    "penawaran_id" "text" NOT NULL,
    "barang_id" "text" NOT NULL,
    "harga_satuan_id" "text",
    "jumlah" double precision NOT NULL,
    "nama_satuan" "text" NOT NULL,
    "faktor_konversi" double precision DEFAULT 1 NOT NULL,
    "harga_satuan" double precision NOT NULL,
    "subtotal" double precision NOT NULL,
    "panjang" double precision,
    "lebar" double precision,
    "tipe_item" "text" DEFAULT 'BARANG'::"text" NOT NULL,
    "vendor_subkontrak_id" "text",
    "biaya_subkontrak" double precision,
    "metode_bayar_vendor" "text",
    "deskripsi_pekerjaan" "text",
    "dpp_satuan" double precision DEFAULT 0 NOT NULL,
    "ppn_satuan" double precision DEFAULT 0 NOT NULL,
    "dpp_total" double precision DEFAULT 0 NOT NULL,
    "ppn_total" double precision DEFAULT 0 NOT NULL,
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone,
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" integer DEFAULT 1,
    "is_deleted" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "item_penawaran_metode_bayar_vendor_check" CHECK ((("metode_bayar_vendor" IS NULL) OR ("metode_bayar_vendor" = ANY (ARRAY['CASH'::"text", 'NET30'::"text"])))),
    CONSTRAINT "item_penawaran_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"]))),
    CONSTRAINT "item_penawaran_tipe_item_check" CHECK (("tipe_item" = ANY (ARRAY['BARANG'::"text", 'JASA'::"text", 'MAKLON'::"text"])))
);


ALTER TABLE "public"."item_penawaran" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."item_penjualan" (
    "id" "text" NOT NULL,
    "penjualan_id" "text" NOT NULL,
    "barang_id" "text" NOT NULL,
    "harga_satuan_id" "text",
    "jumlah" double precision NOT NULL,
    "nama_satuan" "text" NOT NULL,
    "faktor_konversi" double precision NOT NULL,
    "harga_satuan" double precision NOT NULL,
    "subtotal" double precision NOT NULL,
    "hpp_satuan" double precision DEFAULT 0,
    "hpp_total" double precision DEFAULT 0,
    "gross_profit" double precision DEFAULT 0,
    "gross_margin" double precision DEFAULT 0,
    "panjang" double precision,
    "lebar" double precision,
    "tipe_item" "text" DEFAULT 'BARANG'::"text" NOT NULL,
    "vendor_subkontrak_id" "text",
    "biaya_subkontrak" double precision,
    "metode_bayar_vendor" "text",
    "pembelian_id_terkait" "text",
    "deskripsi_pekerjaan" "text",
    "dpp_satuan" double precision DEFAULT 0 NOT NULL,
    "ppn_satuan" double precision DEFAULT 0 NOT NULL,
    "dpp_total" double precision DEFAULT 0 NOT NULL,
    "ppn_total" double precision DEFAULT 0 NOT NULL,
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "billed_panjang" double precision,
    "billed_lebar" double precision,
    "recommended_roll_width_m" double precision,
    "roll_inventory_deferred" integer DEFAULT 0 NOT NULL,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "item_penjualan_metode_bayar_vendor_check" CHECK ((("metode_bayar_vendor" IS NULL) OR ("metode_bayar_vendor" = ANY (ARRAY['CASH'::"text", 'NET30'::"text"])))),
    CONSTRAINT "item_penjualan_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"]))),
    CONSTRAINT "item_penjualan_tipe_item_check" CHECK (("tipe_item" = ANY (ARRAY['BARANG'::"text", 'JASA'::"text", 'MAKLON'::"text"])))
);


ALTER TABLE "public"."item_penjualan" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."item_produksi" (
    "id" "text" NOT NULL,
    "order_produksi_id" "text" NOT NULL,
    "item_penjualan_id" "text" NOT NULL,
    "barang_nama" "text" NOT NULL,
    "jumlah" double precision NOT NULL,
    "nama_satuan" "text" NOT NULL,
    "panjang" double precision,
    "lebar" double precision,
    "keterangan_dimensi" "text",
    "mesin_printing" "text",
    "jenis_bahan" "text",
    "status" "text" DEFAULT 'MENUNGGU'::"text",
    "catatan_produksi" "text",
    "operator_id" "text",
    "mulai_proses" "text",
    "selesai_proses" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "barang_id" "text",
    "billed_panjang" double precision,
    "billed_lebar" double precision,
    "recommended_roll_width_m" double precision,
    "roll_inventory_status" "text" DEFAULT 'NOT_REQUIRED'::"text" NOT NULL,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text"
);


ALTER TABLE "public"."item_produksi" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."item_retur_pembelian" (
    "id" "text" NOT NULL,
    "retur_pembelian_id" "text" NOT NULL,
    "item_pembelian_id" "text" NOT NULL,
    "barang_id" "text" NOT NULL,
    "qty" double precision NOT NULL,
    "qty_base" double precision NOT NULL,
    "nama_satuan" "text" NOT NULL,
    "faktor_konversi" double precision DEFAULT 1 NOT NULL,
    "harga_satuan" double precision NOT NULL,
    "subtotal" double precision NOT NULL,
    "dpp_total" double precision DEFAULT 0 NOT NULL,
    "ppn_total" double precision DEFAULT 0 NOT NULL,
    "movement_id" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone,
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" integer DEFAULT 1,
    "is_deleted" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "item_retur_pembelian_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."item_retur_pembelian" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."item_retur_penjualan" (
    "id" "text" NOT NULL,
    "retur_penjualan_id" "text" NOT NULL,
    "item_penjualan_id" "text" NOT NULL,
    "barang_id" "text" NOT NULL,
    "qty" double precision NOT NULL,
    "qty_base" double precision NOT NULL,
    "nama_satuan" "text" NOT NULL,
    "faktor_konversi" double precision DEFAULT 1 NOT NULL,
    "harga_satuan" double precision NOT NULL,
    "subtotal" double precision NOT NULL,
    "hpp_satuan" double precision DEFAULT 0 NOT NULL,
    "hpp_total" double precision DEFAULT 0 NOT NULL,
    "dpp_total" double precision DEFAULT 0 NOT NULL,
    "ppn_total" double precision DEFAULT 0 NOT NULL,
    "movement_id" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone,
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" integer DEFAULT 1,
    "is_deleted" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "item_retur_penjualan_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."item_retur_penjualan" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."item_surat_jalan" (
    "id" "text" NOT NULL,
    "surat_jalan_id" "text" NOT NULL,
    "nama_barang" "text" NOT NULL,
    "keterangan" "text",
    "ukuran" "text",
    "qty" numeric DEFAULT 1 NOT NULL,
    "satuan" "text",
    "urutan" integer DEFAULT 0 NOT NULL,
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone,
    "updated_by_device" "text" DEFAULT 'server'::"text",
    CONSTRAINT "item_surat_jalan_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."item_surat_jalan" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."journal_entries" (
    "id" "text" NOT NULL,
    "company_id" "text" NOT NULL,
    "branch_id" "text",
    "entry_number" "text" NOT NULL,
    "entry_date" "date" NOT NULL,
    "fiscal_period_id" "text",
    "source_type" "text" NOT NULL,
    "source_id" "text" NOT NULL,
    "source_number" "text",
    "reference_number" "text",
    "description" "text" NOT NULL,
    "status" "text" DEFAULT 'posted'::"text" NOT NULL,
    "posted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "posted_by" "text",
    "sync_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "journal_entries_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'posted'::"text", 'void'::"text"]))),
    CONSTRAINT "journal_entries_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."journal_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."journal_entry_lines" (
    "id" "text" NOT NULL,
    "journal_entry_id" "text" NOT NULL,
    "company_id" "text" NOT NULL,
    "line_number" integer NOT NULL,
    "account_id" "text" NOT NULL,
    "position" "text" NOT NULL,
    "amount" numeric(18,2) NOT NULL,
    "memo" "text",
    "source_type" "text",
    "source_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "journal_entry_lines_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "journal_entry_lines_position_check" CHECK (("position" = ANY (ARRAY['debit'::"text", 'credit'::"text"])))
);


ALTER TABLE "public"."journal_entry_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kategori_barang" (
    "id" "text" NOT NULL,
    "nama" "text" NOT NULL,
    "butuh_spesifikasi_status" integer DEFAULT 0,
    "urutan_tampilan" integer DEFAULT 0,
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "kategori_barang_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."kategori_barang" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."keuangan" (
    "id" "text" NOT NULL,
    "tanggal" "text" NOT NULL,
    "kategori_transaksi" "text" NOT NULL,
    "debit" double precision DEFAULT 0,
    "kredit" double precision DEFAULT 0,
    "keperluan" "text",
    "omzet" double precision DEFAULT 0,
    "biaya_operasional" double precision DEFAULT 0,
    "biaya_bahan" double precision DEFAULT 0,
    "saldo" double precision DEFAULT 0,
    "laba_bersih" double precision DEFAULT 0,
    "catatan" "text",
    "dibuat_oleh" "text",
    "diarsipkan_pada" "text",
    "label_arsip" "text",
    "reference_type" "text",
    "reference_id" "text",
    "dibuat_pada" timestamp with time zone NOT NULL,
    "diperbarui_pada" timestamp with time zone NOT NULL,
    "urutan_tampilan" integer DEFAULT 0,
    "override_saldo" integer DEFAULT 0,
    "override_omzet" integer DEFAULT 0,
    "override_biaya_operasional" integer DEFAULT 0,
    "override_biaya_bahan" integer DEFAULT 0,
    "override_laba_bersih" integer DEFAULT 0,
    "status_transaksi" "text" DEFAULT 'POSTED'::"text" NOT NULL,
    "voided_at" timestamp with time zone,
    "voided_by" "text",
    "void_reason" "text",
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "keuangan_status_transaksi_check" CHECK (("status_transaksi" = ANY (ARRAY['POSTED'::"text", 'VOIDED'::"text"]))),
    CONSTRAINT "keuangan_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."keuangan" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."komponen_kompensasi" (
    "id" "text" NOT NULL,
    "actor_id" "text" NOT NULL,
    "tipe" "text" NOT NULL,
    "nama" "text" NOT NULL,
    "metode" "text" DEFAULT 'TETAP'::"text" NOT NULL,
    "nominal" numeric DEFAULT 0 NOT NULL,
    "persen" numeric DEFAULT 0 NOT NULL,
    "sumber_formula_key" "text",
    "aktif_status" integer DEFAULT 1 NOT NULL,
    "urutan_tampilan" integer DEFAULT 0 NOT NULL,
    "catatan" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone,
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" integer DEFAULT 0,
    "is_deleted" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "komponen_kompensasi_metode_check" CHECK (("metode" = ANY (ARRAY['TETAP'::"text", 'PERSEN'::"text"]))),
    CONSTRAINT "komponen_kompensasi_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"]))),
    CONSTRAINT "komponen_kompensasi_tipe_check" CHECK (("tipe" = ANY (ARRAY['GAJI_POKOK'::"text", 'TUNJANGAN'::"text", 'KOMISI'::"text", 'BONUS'::"text"])))
);


ALTER TABLE "public"."komponen_kompensasi" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kredensial" (
    "id" "text" NOT NULL,
    "pemilik_id" "text" NOT NULL,
    "nama_layanan" "text" NOT NULL,
    "nama_pengguna_akun" "text" NOT NULL,
    "password_terenkripsi" "text" NOT NULL,
    "catatan" "text",
    "privat_status" integer DEFAULT 1,
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "kredensial_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."kredensial" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lokasi" (
    "id" "text" NOT NULL,
    "nama" "text" NOT NULL,
    "kode" "text",
    "alamat" "text",
    "is_default" integer DEFAULT 0 NOT NULL,
    "aktif_status" integer DEFAULT 1 NOT NULL,
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    CONSTRAINT "lokasi_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."lokasi" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nsfp_pool" (
    "id" "text" NOT NULL,
    "tahun" "text" NOT NULL,
    "kode_transaksi" "text" DEFAULT '01'::"text" NOT NULL,
    "nomor_seri" "text" NOT NULL,
    "status" "text" DEFAULT 'TERSEDIA'::"text" NOT NULL,
    "penjualan_id" "text",
    "catatan" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    CONSTRAINT "nsfp_pool_status_check" CHECK (("status" = ANY (ARRAY['TERSEDIA'::"text", 'TERPAKAI'::"text", 'BATAL'::"text"]))),
    CONSTRAINT "nsfp_pool_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."nsfp_pool" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."opsi_finishing" (
    "id" "text" NOT NULL,
    "nama" "text" NOT NULL,
    "urutan_tampilan" integer DEFAULT 0,
    "aktif_status" integer DEFAULT 1,
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "opsi_finishing_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."opsi_finishing" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_produksi" (
    "id" "text" NOT NULL,
    "penjualan_id" "text" NOT NULL,
    "nomor_spk" "text" NOT NULL,
    "pelanggan_nama" "text",
    "total_item" integer DEFAULT 0,
    "status" "text" DEFAULT 'MENUNGGU'::"text",
    "prioritas" "text" DEFAULT 'NORMAL'::"text",
    "tanggal_deadline" "text",
    "catatan" "text",
    "dibuat_oleh" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "diselesaikan_pada" timestamp with time zone,
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    "status_override_manual" boolean DEFAULT false NOT NULL,
    CONSTRAINT "order_produksi_prioritas_check" CHECK (("prioritas" = ANY (ARRAY['NORMAL'::"text", 'KILAT'::"text", 'RENDAH'::"text", 'TINGGI'::"text", 'MENDESAK'::"text"])))
);


ALTER TABLE "public"."order_produksi" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pegawai" (
    "id" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "role_code" "text" NOT NULL,
    "is_active" integer DEFAULT 1 NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "profit_share_percent" double precision,
    "cash_advance_categories" "jsonb",
    "keperluan_keyword" "text",
    "bonus_percent" double precision,
    "bonus_source_formula_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pegawai" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pelanggan" (
    "id" "text" NOT NULL,
    "tipe_pelanggan" "text",
    "nama" "text" NOT NULL,
    "nama_perusahaan" "text",
    "npwp" "text",
    "alamat_npwp" "text",
    "nama_di_npwp" "text",
    "email" "text",
    "telepon" "text",
    "alamat" "text",
    "member_status" integer DEFAULT 0,
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "pelanggan_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."pelanggan" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pelunasan_hutang" (
    "id" "text" NOT NULL,
    "id_hutang" "text" NOT NULL,
    "tanggal_bayar" "text" NOT NULL,
    "jumlah_bayar" double precision NOT NULL,
    "metode_pembayaran" "text" DEFAULT 'CASH'::"text",
    "referensi" "text",
    "catatan" "text",
    "dibuat_oleh" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "pelunasan_hutang_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."pelunasan_hutang" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pelunasan_piutang" (
    "id" "text" NOT NULL,
    "id_piutang" "text" NOT NULL,
    "tanggal_bayar" "text" NOT NULL,
    "jumlah_bayar" double precision NOT NULL,
    "metode_pembayaran" "text" DEFAULT 'CASH'::"text",
    "referensi" "text",
    "catatan" "text",
    "dibuat_oleh" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "pelunasan_piutang_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."pelunasan_piutang" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pembelian" (
    "id" "text" NOT NULL,
    "nomor_pembelian" "text" NOT NULL,
    "vendor_id" "text",
    "total_jumlah" double precision NOT NULL,
    "jumlah_dibayar" double precision DEFAULT 0,
    "metode_pembayaran" "text",
    "catatan" "text",
    "dibuat_oleh" "text",
    "diterima_oleh" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "tanggal" "date" DEFAULT CURRENT_DATE,
    "nomor_faktur" "text",
    "status_pembayaran" "text" DEFAULT 'LUNAS'::"text",
    "tipe_pembelian" "text" DEFAULT 'BARANG'::"text" NOT NULL,
    "penjualan_id_sumber" "text",
    "status_transaksi" "text" DEFAULT 'POSTED'::"text" NOT NULL,
    "voided_at" timestamp with time zone,
    "voided_by" "text",
    "void_reason" "text",
    "kena_ppn" integer DEFAULT 0 NOT NULL,
    "ppn_persen" double precision DEFAULT 0 NOT NULL,
    "ppn_metode" "text" DEFAULT 'EKSKLUSIF'::"text" NOT NULL,
    "dpp_total" double precision DEFAULT 0 NOT NULL,
    "ppn_total" double precision DEFAULT 0 NOT NULL,
    "dapat_dikreditkan" integer DEFAULT 1 NOT NULL,
    "nomor_faktur_pajak_vendor" "text",
    "tanggal_faktur_pajak" "date",
    "vendor_npwp_snapshot" "text",
    "purchase_order_id" "text",
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    "periode_id" "text",
    CONSTRAINT "pembelian_ppn_metode_check" CHECK (("ppn_metode" = ANY (ARRAY['EKSKLUSIF'::"text", 'INKLUSIF'::"text"]))),
    CONSTRAINT "pembelian_status_pembayaran_check" CHECK (("status_pembayaran" = ANY (ARRAY['LUNAS'::"text", 'HUTANG'::"text", 'SEBAGIAN'::"text"]))),
    CONSTRAINT "pembelian_status_transaksi_check" CHECK (("status_transaksi" = ANY (ARRAY['DRAFT'::"text", 'POSTED'::"text", 'VOIDED'::"text"]))),
    CONSTRAINT "pembelian_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"]))),
    CONSTRAINT "pembelian_tipe_pembelian_check" CHECK (("tipe_pembelian" = ANY (ARRAY['BARANG'::"text", 'MAKLON'::"text"])))
);


ALTER TABLE "public"."pembelian" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."penawaran" (
    "id" "text" NOT NULL,
    "nomor_penawaran" "text" NOT NULL,
    "pelanggan_id" "text",
    "pelanggan_nama_snapshot" "text",
    "pelanggan_kota" "text",
    "tanggal" "date" DEFAULT CURRENT_DATE NOT NULL,
    "berlaku_sampai" "date",
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "total_jumlah" double precision DEFAULT 0 NOT NULL,
    "kena_ppn" integer DEFAULT 0 NOT NULL,
    "ppn_persen" double precision DEFAULT 0 NOT NULL,
    "ppn_metode" "text" DEFAULT 'EKSKLUSIF'::"text" NOT NULL,
    "dpp_total" double precision DEFAULT 0 NOT NULL,
    "ppn_total" double precision DEFAULT 0 NOT NULL,
    "catatan" "text",
    "dibuat_oleh" "text",
    "converted_penjualan_id" "text",
    "converted_at" timestamp with time zone,
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone,
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" integer DEFAULT 1,
    "is_deleted" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "penawaran_ppn_metode_check" CHECK (("ppn_metode" = ANY (ARRAY['EKSKLUSIF'::"text", 'INKLUSIF'::"text"]))),
    CONSTRAINT "penawaran_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'SENT'::"text", 'ACCEPTED'::"text", 'CONVERTED'::"text", 'CANCELLED'::"text", 'EXPIRED'::"text"]))),
    CONSTRAINT "penawaran_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."penawaran" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pengaturan_toko" (
    "id" "text" DEFAULT 'default'::"text" NOT NULL,
    "nama_toko" "text" DEFAULT 'Toko'::"text" NOT NULL,
    "alamat" "text",
    "telepon" "text",
    "email" "text",
    "npwp" "text",
    "alamat_npwp" "text",
    "status_pkp" integer DEFAULT 0 NOT NULL,
    "ppn_persen_default" double precision DEFAULT 11 NOT NULL,
    "ppn_metode_default" "text" DEFAULT 'EKSKLUSIF'::"text" NOT NULL,
    "ppn_default_aktif" integer DEFAULT 0 NOT NULL,
    "nsfp_kode_transaksi_default" "text" DEFAULT '01'::"text" NOT NULL,
    "nsfp_tahun_aktif" "text",
    "nsfp_seri_terakhir" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "slogan" "text",
    "website" "text",
    "bank_nama" "text",
    "bank_nomor" "text",
    "bank_atas_nama" "text",
    "catatan_faktur" "text",
    "catatan_struk" "text",
    "inv_prefix" "text" DEFAULT 'INV'::"text" NOT NULL,
    "inv_format" "text" DEFAULT 'PREFIX-DATE-SEQ'::"text" NOT NULL,
    "inv_reset" "text" DEFAULT 'daily'::"text" NOT NULL,
    "inv_padding" integer DEFAULT 3 NOT NULL,
    "inv_start_seq" integer DEFAULT 1 NOT NULL,
    "spk_prefix" "text" DEFAULT 'SPK'::"text" NOT NULL,
    "spk_format" "text" DEFAULT 'PREFIX-SEQ'::"text" NOT NULL,
    "spk_reset" "text" DEFAULT 'never'::"text" NOT NULL,
    "spk_padding" integer DEFAULT 4 NOT NULL,
    "spk_start_seq" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "pengaturan_toko_inv_format_check" CHECK (("inv_format" = ANY (ARRAY['PREFIX-DATE-SEQ'::"text", 'PREFIX-SEQ'::"text"]))),
    CONSTRAINT "pengaturan_toko_inv_reset_check" CHECK (("inv_reset" = ANY (ARRAY['daily'::"text", 'monthly'::"text", 'yearly'::"text", 'never'::"text"]))),
    CONSTRAINT "pengaturan_toko_ppn_metode_default_check" CHECK (("ppn_metode_default" = ANY (ARRAY['EKSKLUSIF'::"text", 'INKLUSIF'::"text"]))),
    CONSTRAINT "pengaturan_toko_spk_format_check" CHECK (("spk_format" = ANY (ARRAY['PREFIX-DATE-SEQ'::"text", 'PREFIX-SEQ'::"text"]))),
    CONSTRAINT "pengaturan_toko_spk_reset_check" CHECK (("spk_reset" = ANY (ARRAY['daily'::"text", 'monthly'::"text", 'yearly'::"text", 'never'::"text"]))),
    CONSTRAINT "pengaturan_toko_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."pengaturan_toko" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."penjualan" (
    "id" "text" NOT NULL,
    "nomor_faktur" "text" NOT NULL,
    "pelanggan_id" "text",
    "pelanggan_nama_snapshot" "text",
    "pelanggan_kota" "text",
    "total_jumlah" double precision NOT NULL,
    "jumlah_dibayar" double precision DEFAULT 0,
    "jumlah_kembalian" double precision DEFAULT 0,
    "metode_pembayaran" "text",
    "kasir_id" "text",
    "catatan" "text",
    "status_transaksi" "text" DEFAULT 'POSTED'::"text" NOT NULL,
    "voided_at" timestamp with time zone,
    "voided_by" "text",
    "void_reason" "text",
    "kena_ppn" integer DEFAULT 0 NOT NULL,
    "ppn_persen" double precision DEFAULT 0 NOT NULL,
    "ppn_metode" "text" DEFAULT 'EKSKLUSIF'::"text" NOT NULL,
    "dpp_total" double precision DEFAULT 0 NOT NULL,
    "ppn_total" double precision DEFAULT 0 NOT NULL,
    "nsfp_kode_transaksi" "text",
    "nsfp_tahun" "text",
    "nsfp_nomor_seri" "text",
    "tanggal_faktur_pajak" "date",
    "pelanggan_npwp_snapshot" "text",
    "pelanggan_alamat_npwp_snapshot" "text",
    "pelanggan_nama_npwp_snapshot" "text",
    "penawaran_id" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    "periode_id" "text",
    "biaya_tambahan_total" numeric DEFAULT 0 NOT NULL,
    CONSTRAINT "penjualan_ppn_metode_check" CHECK (("ppn_metode" = ANY (ARRAY['EKSKLUSIF'::"text", 'INKLUSIF'::"text"]))),
    CONSTRAINT "penjualan_status_transaksi_check" CHECK (("status_transaksi" = ANY (ARRAY['DRAFT'::"text", 'POSTED'::"text", 'VOIDED'::"text"]))),
    CONSTRAINT "penjualan_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."penjualan" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."peran_pegawai" (
    "id" "text" NOT NULL,
    "role_code" "text" NOT NULL,
    "role_label" "text" NOT NULL,
    "role_group" "text" DEFAULT 'other'::"text" NOT NULL,
    "description" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "peran_pegawai_role_group_check" CHECK (("role_group" = ANY (ARRAY['owner'::"text", 'management'::"text", 'sales'::"text", 'staff'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."peran_pegawai" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pinjaman_karyawan" (
    "id" "text" NOT NULL,
    "actor_id" "text" NOT NULL,
    "tanggal" "date" DEFAULT CURRENT_DATE NOT NULL,
    "jumlah" numeric DEFAULT 0 NOT NULL,
    "jenis" "text" NOT NULL,
    "keterangan" "text",
    "keuangan_ref_id" "text",
    "proses_gaji_id" "text",
    "dibuat_oleh" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone,
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" integer DEFAULT 0,
    "is_deleted" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "pinjaman_karyawan_jenis_check" CHECK (("jenis" = ANY (ARRAY['TARIK'::"text", 'POTONG_GAJI'::"text", 'BAYAR_TUNAI'::"text"]))),
    CONSTRAINT "pinjaman_karyawan_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."pinjaman_karyawan" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."piutang_penjualan" (
    "id" "text" NOT NULL,
    "id_penjualan" "text" NOT NULL,
    "jumlah_piutang" double precision NOT NULL,
    "jumlah_terbayar" double precision DEFAULT 0,
    "sisa_piutang" double precision NOT NULL,
    "jatuh_tempo" "text",
    "status" "text" DEFAULT 'AKTIF'::"text",
    "catatan" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "piutang_penjualan_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'LUNAS'::"text", 'JATUH_TEMPO'::"text", 'SEBAGIAN'::"text"]))),
    CONSTRAINT "piutang_penjualan_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."piutang_penjualan" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."production_material_consumptions" (
    "id" "text" NOT NULL,
    "item_produksi_id" "text" NOT NULL,
    "item_penjualan_id" "text" NOT NULL,
    "barang_id" "text" NOT NULL,
    "roll_variant_id" "text" NOT NULL,
    "roll_width_m" double precision NOT NULL,
    "linear_used_m" double precision NOT NULL,
    "area_used_m2" double precision NOT NULL,
    "billed_area_m2" double precision DEFAULT 0 NOT NULL,
    "waste_area_m2" double precision DEFAULT 0 NOT NULL,
    "movement_id" "text",
    "waste_movement_id" "text",
    "operator_id" "text",
    "status" "text" DEFAULT 'POSTED'::"text" NOT NULL,
    "catatan" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone,
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" integer DEFAULT 1,
    "is_deleted" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "production_material_consumptions_status_check" CHECK (("status" = ANY (ARRAY['POSTED'::"text", 'VOIDED'::"text"]))),
    CONSTRAINT "production_material_consumptions_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."production_material_consumptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profil" (
    "id" "text" NOT NULL,
    "nama_pengguna" "text" NOT NULL,
    "email" "text",
    "nama_lengkap" "text",
    "password_hash" "text" NOT NULL,
    "role" "text" DEFAULT 'user'::"text",
    "aktif_status" integer DEFAULT 1,
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "profil_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'manager'::"text", 'staff'::"text", 'kasir'::"text", 'operator'::"text", 'user'::"text", 'demo'::"text"])))
    CONSTRAINT "profil_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."profil" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proses_gaji" (
    "id" "text" NOT NULL,
    "periode" "text" NOT NULL,
    "tanggal_bayar" "date",
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "metode_bayar" "text" DEFAULT 'CASH'::"text" NOT NULL,
    "total_bruto" numeric DEFAULT 0 NOT NULL,
    "total_potongan_kasbon" numeric DEFAULT 0 NOT NULL,
    "total_neto" numeric DEFAULT 0 NOT NULL,
    "catatan" "text",
    "dibuat_oleh" "text",
    "voided_at" timestamp with time zone,
    "voided_by" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone,
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" integer DEFAULT 0,
    "is_deleted" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "proses_gaji_metode_bayar_check" CHECK (("metode_bayar" = ANY (ARRAY['CASH'::"text", 'TRANSFER'::"text"]))),
    CONSTRAINT "proses_gaji_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'DIBAYAR'::"text", 'VOIDED'::"text"]))),
    CONSTRAINT "proses_gaji_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."proses_gaji" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_order_items" (
    "id" "text" NOT NULL,
    "purchase_order_id" "text" NOT NULL,
    "barang_id" "text" NOT NULL,
    "harga_satuan_id" "text",
    "jumlah" double precision NOT NULL,
    "qty_received" double precision DEFAULT 0 NOT NULL,
    "nama_satuan" "text" NOT NULL,
    "faktor_konversi" double precision DEFAULT 1 NOT NULL,
    "harga_satuan" double precision NOT NULL,
    "subtotal" double precision NOT NULL,
    "panjang" double precision,
    "lebar" double precision,
    "dpp_satuan" double precision DEFAULT 0 NOT NULL,
    "ppn_satuan" double precision DEFAULT 0 NOT NULL,
    "dpp_total" double precision DEFAULT 0 NOT NULL,
    "ppn_total" double precision DEFAULT 0 NOT NULL,
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone,
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" integer DEFAULT 1,
    "is_deleted" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "purchase_order_items_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."purchase_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" "text" NOT NULL,
    "nomor_po" "text" NOT NULL,
    "vendor_id" "text",
    "tanggal" "date" DEFAULT CURRENT_DATE NOT NULL,
    "expected_date" "date",
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "total_jumlah" double precision DEFAULT 0 NOT NULL,
    "kena_ppn" integer DEFAULT 0 NOT NULL,
    "ppn_persen" double precision DEFAULT 0 NOT NULL,
    "ppn_metode" "text" DEFAULT 'EKSKLUSIF'::"text" NOT NULL,
    "dpp_total" double precision DEFAULT 0 NOT NULL,
    "ppn_total" double precision DEFAULT 0 NOT NULL,
    "catatan" "text",
    "dibuat_oleh" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone,
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" integer DEFAULT 1,
    "is_deleted" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "purchase_orders_ppn_metode_check" CHECK (("ppn_metode" = ANY (ARRAY['EKSKLUSIF'::"text", 'INKLUSIF'::"text"]))),
    CONSTRAINT "purchase_orders_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'SENT'::"text", 'PARTIAL_RECEIVED'::"text", 'RECEIVED'::"text", 'CANCELLED'::"text"]))),
    CONSTRAINT "purchase_orders_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."purchase_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retur_pembelian" (
    "id" "text" NOT NULL,
    "nomor_retur" "text" NOT NULL,
    "pembelian_id" "text" NOT NULL,
    "tanggal" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "text" DEFAULT 'POSTED'::"text" NOT NULL,
    "total_retur" double precision DEFAULT 0 NOT NULL,
    "dpp_total" double precision DEFAULT 0 NOT NULL,
    "ppn_total" double precision DEFAULT 0 NOT NULL,
    "debt_reduction" double precision DEFAULT 0 NOT NULL,
    "refund_amount" double precision DEFAULT 0 NOT NULL,
    "reason" "text" NOT NULL,
    "catatan" "text",
    "dibuat_oleh" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone,
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" integer DEFAULT 1,
    "is_deleted" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "retur_pembelian_status_check" CHECK (("status" = ANY (ARRAY['POSTED'::"text", 'CANCELLED'::"text"]))),
    CONSTRAINT "retur_pembelian_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."retur_pembelian" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retur_penjualan" (
    "id" "text" NOT NULL,
    "nomor_retur" "text" NOT NULL,
    "penjualan_id" "text" NOT NULL,
    "tanggal" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "text" DEFAULT 'POSTED'::"text" NOT NULL,
    "total_retur" double precision DEFAULT 0 NOT NULL,
    "dpp_total" double precision DEFAULT 0 NOT NULL,
    "ppn_total" double precision DEFAULT 0 NOT NULL,
    "total_hpp" double precision DEFAULT 0 NOT NULL,
    "receivable_reduction" double precision DEFAULT 0 NOT NULL,
    "refund_amount" double precision DEFAULT 0 NOT NULL,
    "reason" "text" NOT NULL,
    "catatan" "text",
    "dibuat_oleh" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone,
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" integer DEFAULT 1,
    "is_deleted" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "retur_penjualan_status_check" CHECK (("status" = ANY (ARRAY['POSTED'::"text", 'CANCELLED'::"text"]))),
    CONSTRAINT "retur_penjualan_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."retur_penjualan" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rumus_buku_kas" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "column_key" "text" NOT NULL,
    "db_column" "text",
    "ast" "jsonb" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "formula_key" "text",
    "actor_id" "text",
    "formula_group" "text" DEFAULT 'custom'::"text" NOT NULL,
    "is_visible_in_summary" boolean DEFAULT false NOT NULL,
    CONSTRAINT "rumus_buku_kas_formula_group_check" CHECK (("formula_group" = ANY (ARRAY['summary'::"text", 'profit_share'::"text", 'cash_advance'::"text", 'bonus'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."rumus_buku_kas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."satuan_barang" (
    "id" "text" NOT NULL,
    "nama" "text" NOT NULL,
    "urutan_tampilan" integer DEFAULT 0,
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "satuan_barang_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."satuan_barang" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."slip_gaji" (
    "id" "text" NOT NULL,
    "proses_gaji_id" "text" NOT NULL,
    "actor_id" "text" NOT NULL,
    "bruto" numeric DEFAULT 0 NOT NULL,
    "potongan_kasbon" numeric DEFAULT 0 NOT NULL,
    "neto" numeric DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "metode_bayar" "text" DEFAULT 'CASH'::"text" NOT NULL,
    "keuangan_ref_id" "text",
    "komponen_snapshot" "jsonb",
    "catatan" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone,
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" integer DEFAULT 0,
    "is_deleted" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "slip_gaji_metode_bayar_check" CHECK (("metode_bayar" = ANY (ARRAY['CASH'::"text", 'TRANSFER'::"text"]))),
    CONSTRAINT "slip_gaji_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'DIBAYAR'::"text", 'VOIDED'::"text"]))),
    CONSTRAINT "slip_gaji_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."slip_gaji" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spesifikasi_cepat_barang" (
    "id" "text" NOT NULL,
    "kategori_id" "text" NOT NULL,
    "tipe_spesifikasi" "text" NOT NULL,
    "nilai_spesifikasi" "text" NOT NULL,
    "urutan_tampilan" integer DEFAULT 0,
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "spesifikasi_cepat_barang_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."spesifikasi_cepat_barang" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_opname_items" (
    "id" "text" NOT NULL,
    "stock_opname_id" "text" NOT NULL,
    "barang_id" "text" NOT NULL,
    "system_qty" double precision DEFAULT 0 NOT NULL,
    "counted_qty" double precision,
    "delta_qty" double precision DEFAULT 0 NOT NULL,
    "unit_cost" double precision DEFAULT 0 NOT NULL,
    "delta_value" double precision DEFAULT 0 NOT NULL,
    "catatan" "text",
    "movement_id" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone,
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" integer DEFAULT 1,
    "is_deleted" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "stock_opname_items_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."stock_opname_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_opnames" (
    "id" "text" NOT NULL,
    "nomor_opname" "text" NOT NULL,
    "tanggal" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "catatan" "text",
    "dibuat_oleh" "text",
    "posted_at" timestamp with time zone,
    "posted_by" "text",
    "total_items" integer DEFAULT 0 NOT NULL,
    "total_delta_qty" double precision DEFAULT 0 NOT NULL,
    "total_delta_value" double precision DEFAULT 0 NOT NULL,
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone,
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" integer DEFAULT 1,
    "is_deleted" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "stock_opnames_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'POSTED'::"text", 'CANCELLED'::"text"]))),
    CONSTRAINT "stock_opnames_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."stock_opnames" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subkategori_barang" (
    "id" "text" NOT NULL,
    "kategori_id" "text" NOT NULL,
    "nama" "text" NOT NULL,
    "urutan_tampilan" integer DEFAULT 0,
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "subkategori_barang_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."subkategori_barang" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."surat_jalan" (
    "id" "text" NOT NULL,
    "nomor_sj" "text" NOT NULL,
    "penjualan_id" "text",
    "pelanggan_nama" "text",
    "pelanggan_alamat" "text",
    "pelanggan_telepon" "text",
    "tanggal" "text" NOT NULL,
    "nomor_kendaraan" "text",
    "pengirim_nama" "text",
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "catatan" "text",
    "dibuat_oleh" "text",
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "tanggal_terkirim" timestamp with time zone,
    "tanggal_diterima" timestamp with time zone,
    "diterima_oleh" "text",
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone,
    "updated_by_device" "text" DEFAULT 'server'::"text",
    CONSTRAINT "surat_jalan_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'TERKIRIM'::"text", 'DITERIMA'::"text", 'BATAL'::"text"]))),
    CONSTRAINT "surat_jalan_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."surat_jalan" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sync_conflicts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "text" NOT NULL,
    "conflict_type" "text" DEFAULT 'lww'::"text" NOT NULL,
    "winner_source" "text" NOT NULL,
    "loser_source" "text" NOT NULL,
    "winner_payload" "jsonb" NOT NULL,
    "loser_payload" "jsonb" NOT NULL,
    "winner_updated_at_server" timestamp with time zone,
    "loser_updated_at_server" timestamp with time zone,
    "resolved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sync_conflicts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sync_mutation_registry" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_mutation_id" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "text" NOT NULL,
    "device_id" "text" NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payload_hash" "text"
);


ALTER TABLE "public"."sync_mutation_registry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transaksi_penggantian" (
    "transaction_id" "text" NOT NULL,
    "formula_key" "text" NOT NULL,
    "override_value" double precision NOT NULL,
    "overridden_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."transaksi_penggantian" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transaksi_terhitung" (
    "transaction_id" "text" NOT NULL,
    "formula_key" "text" NOT NULL,
    "value" double precision DEFAULT 0 NOT NULL,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."transaksi_terhitung" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_ppn_keluaran" AS
 SELECT "p"."id" AS "penjualan_id",
    "p"."nomor_faktur",
    "p"."tanggal_faktur_pajak",
    ("p"."dibuat_pada")::"date" AS "tanggal_transaksi",
    "p"."nsfp_kode_transaksi",
    "p"."nsfp_tahun",
    "p"."nsfp_nomor_seri",
        CASE
            WHEN (("p"."nsfp_kode_transaksi" IS NOT NULL) AND ("p"."nsfp_tahun" IS NOT NULL) AND ("p"."nsfp_nomor_seri" IS NOT NULL)) THEN (((("p"."nsfp_kode_transaksi" || '0.000-'::"text") || "p"."nsfp_tahun") || '.'::"text") || "p"."nsfp_nomor_seri")
            ELSE NULL::"text"
        END AS "nomor_faktur_pajak",
    "p"."pelanggan_id",
    COALESCE("p"."pelanggan_nama_npwp_snapshot", "p"."pelanggan_nama_snapshot", "pl"."nama") AS "pelanggan_nama",
    COALESCE("p"."pelanggan_npwp_snapshot", "pl"."npwp") AS "pelanggan_npwp",
    COALESCE("p"."pelanggan_alamat_npwp_snapshot", "pl"."alamat_npwp", "pl"."alamat") AS "pelanggan_alamat",
    "p"."dpp_total",
    "p"."ppn_persen",
    "p"."ppn_total",
    "p"."total_jumlah",
    "p"."status_transaksi",
    "p"."kena_ppn"
   FROM ("public"."penjualan" "p"
     LEFT JOIN "public"."pelanggan" "pl" ON (("pl"."id" = "p"."pelanggan_id")))
  WHERE ("p"."kena_ppn" = 1);


ALTER VIEW "public"."v_ppn_keluaran" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendor" (
    "id" "text" NOT NULL,
    "nama_perusahaan" "text" NOT NULL,
    "email" "text",
    "telepon" "text",
    "alamat" "text",
    "kontak_person" "text",
    "ketentuan_bayar" "text",
    "aktif_status" integer DEFAULT 1,
    "catatan" "text",
    "npwp" "text",
    "alamat_npwp" "text",
    "nama_di_npwp" "text",
    "tipe_vendor" "text" DEFAULT 'SUPPLIER'::"text" NOT NULL,
    "dibuat_pada" timestamp with time zone DEFAULT "now"(),
    "diperbarui_pada" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_synced_at" timestamp with time zone,
    "sync_version" integer DEFAULT 1,
    "updated_at_server" timestamp with time zone DEFAULT "now"(),
    "updated_by_device" "text" DEFAULT 'server'::"text",
    "change_version" bigint DEFAULT 1,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "client_mutation_id" "text",
    CONSTRAINT "vendor_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'conflict'::"text"]))),
    CONSTRAINT "vendor_tipe_vendor_check" CHECK (("tipe_vendor" = ANY (ARRAY['SUPPLIER'::"text", 'SUBKONTRAKTOR'::"text", 'KEDUANYA'::"text"])))
);


ALTER TABLE "public"."vendor" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_ppn_masukan" AS
 SELECT "pb"."id" AS "pembelian_id",
    "pb"."nomor_pembelian",
    "pb"."nomor_faktur",
    "pb"."tanggal_faktur_pajak",
    "pb"."tanggal" AS "tanggal_transaksi",
    "pb"."nomor_faktur_pajak_vendor",
    "pb"."vendor_id",
    COALESCE("pb"."vendor_npwp_snapshot", "v"."npwp") AS "vendor_npwp",
    "v"."nama_perusahaan" AS "vendor_nama",
    COALESCE("v"."alamat_npwp", "v"."alamat") AS "vendor_alamat",
    "pb"."dpp_total",
    "pb"."ppn_persen",
    "pb"."ppn_total",
    "pb"."total_jumlah",
    "pb"."dapat_dikreditkan",
    "pb"."status_transaksi",
    "pb"."kena_ppn"
   FROM ("public"."pembelian" "pb"
     LEFT JOIN "public"."vendor" "v" ON (("v"."id" = "pb"."vendor_id")))
  WHERE ("pb"."kena_ppn" = 1);


ALTER VIEW "public"."v_ppn_masukan" OWNER TO "postgres";


ALTER TABLE ONLY "public"."accounting_periods"
    ADD CONSTRAINT "accounting_periods_period_key_key" UNIQUE ("period_key");



ALTER TABLE ONLY "public"."accounting_periods"
    ADD CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounting_posting_rules"
    ADD CONSTRAINT "accounting_posting_rules_company_id_source_type_rule_name_key" UNIQUE ("company_id", "source_type", "rule_name");



ALTER TABLE ONLY "public"."accounting_posting_rules"
    ADD CONSTRAINT "accounting_posting_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."barang"
    ADD CONSTRAINT "barang_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."barang_roll_variants"
    ADD CONSTRAINT "barang_roll_variants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."barang_roll_variants"
    ADD CONSTRAINT "barang_roll_variants_unique_width" UNIQUE ("barang_id", "lebar_m");



ALTER TABLE ONLY "public"."biaya_tambahan_penjualan"
    ADD CONSTRAINT "biaya_tambahan_penjualan_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_company_id_account_code_key" UNIQUE ("company_id", "account_code");



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_registry"
    ADD CONSTRAINT "device_registry_pkey" PRIMARY KEY ("device_id");



ALTER TABLE ONLY "public"."finance_category_definitions"
    ADD CONSTRAINT "finance_category_definitions_category_code_key" UNIQUE ("category_code");



ALTER TABLE ONLY "public"."finance_category_definitions"
    ADD CONSTRAINT "finance_category_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_metric_column_rules"
    ADD CONSTRAINT "finance_metric_column_rules_column_name_key" UNIQUE ("column_name");



ALTER TABLE ONLY "public"."finance_metric_column_rules"
    ADD CONSTRAINT "finance_metric_column_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_metric_mappings"
    ADD CONSTRAINT "finance_metric_mappings_metric_key_key" UNIQUE ("metric_key");



ALTER TABLE ONLY "public"."finance_metric_mappings"
    ADD CONSTRAINT "finance_metric_mappings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fiscal_periods"
    ADD CONSTRAINT "fiscal_periods_company_id_period_name_key" UNIQUE ("company_id", "period_name");



ALTER TABLE ONLY "public"."fiscal_periods"
    ADD CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."harga_barang_satuan"
    ADD CONSTRAINT "harga_barang_satuan_barang_id_nama_satuan_key" UNIQUE ("barang_id", "nama_satuan");



ALTER TABLE ONLY "public"."harga_barang_satuan"
    ADD CONSTRAINT "harga_barang_satuan_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hutang_pembelian"
    ADD CONSTRAINT "hutang_pembelian_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."item_finishing"
    ADD CONSTRAINT "item_finishing_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."item_pembelian"
    ADD CONSTRAINT "item_pembelian_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."item_penawaran"
    ADD CONSTRAINT "item_penawaran_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."item_penjualan"
    ADD CONSTRAINT "item_penjualan_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."item_produksi"
    ADD CONSTRAINT "item_produksi_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."item_retur_pembelian"
    ADD CONSTRAINT "item_retur_pembelian_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."item_retur_penjualan"
    ADD CONSTRAINT "item_retur_penjualan_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."item_surat_jalan"
    ADD CONSTRAINT "item_surat_jalan_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_company_id_entry_number_key" UNIQUE ("company_id", "entry_number");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_company_id_source_type_source_id_key" UNIQUE ("company_id", "source_type", "source_id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_journal_entry_id_line_number_key" UNIQUE ("journal_entry_id", "line_number");



ALTER TABLE ONLY "public"."journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kategori_barang"
    ADD CONSTRAINT "kategori_barang_nama_key" UNIQUE ("nama");



ALTER TABLE ONLY "public"."kategori_barang"
    ADD CONSTRAINT "kategori_barang_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."keuangan"
    ADD CONSTRAINT "keuangan_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."komponen_kompensasi"
    ADD CONSTRAINT "komponen_kompensasi_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kredensial"
    ADD CONSTRAINT "kredensial_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lokasi"
    ADD CONSTRAINT "lokasi_kode_key" UNIQUE ("kode");



ALTER TABLE ONLY "public"."lokasi"
    ADD CONSTRAINT "lokasi_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nsfp_pool"
    ADD CONSTRAINT "nsfp_pool_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nsfp_pool"
    ADD CONSTRAINT "nsfp_pool_tahun_kode_transaksi_nomor_seri_key" UNIQUE ("tahun", "kode_transaksi", "nomor_seri");



ALTER TABLE ONLY "public"."opsi_finishing"
    ADD CONSTRAINT "opsi_finishing_nama_key" UNIQUE ("nama");



ALTER TABLE ONLY "public"."opsi_finishing"
    ADD CONSTRAINT "opsi_finishing_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_produksi"
    ADD CONSTRAINT "order_produksi_nomor_spk_key" UNIQUE ("nomor_spk");



ALTER TABLE ONLY "public"."order_produksi"
    ADD CONSTRAINT "order_produksi_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pegawai"
    ADD CONSTRAINT "pegawai_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pelanggan"
    ADD CONSTRAINT "pelanggan_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pelunasan_hutang"
    ADD CONSTRAINT "pelunasan_hutang_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pelunasan_piutang"
    ADD CONSTRAINT "pelunasan_piutang_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pembelian"
    ADD CONSTRAINT "pembelian_nomor_pembelian_key" UNIQUE ("nomor_pembelian");



ALTER TABLE ONLY "public"."pembelian"
    ADD CONSTRAINT "pembelian_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."penawaran"
    ADD CONSTRAINT "penawaran_nomor_penawaran_key" UNIQUE ("nomor_penawaran");



ALTER TABLE ONLY "public"."penawaran"
    ADD CONSTRAINT "penawaran_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pengaturan_toko"
    ADD CONSTRAINT "pengaturan_toko_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."penjualan"
    ADD CONSTRAINT "penjualan_nomor_faktur_key" UNIQUE ("nomor_faktur");



ALTER TABLE ONLY "public"."penjualan"
    ADD CONSTRAINT "penjualan_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."peran_pegawai"
    ADD CONSTRAINT "peran_pegawai_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."peran_pegawai"
    ADD CONSTRAINT "peran_pegawai_role_code_key" UNIQUE ("role_code");



ALTER TABLE ONLY "public"."pinjaman_karyawan"
    ADD CONSTRAINT "pinjaman_karyawan_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."piutang_penjualan"
    ADD CONSTRAINT "piutang_penjualan_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_material_consumptions"
    ADD CONSTRAINT "production_material_consumptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profil"
    ADD CONSTRAINT "profil_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profil"
    ADD CONSTRAINT "profil_nama_pengguna_key" UNIQUE ("nama_pengguna");



ALTER TABLE ONLY "public"."profil"
    ADD CONSTRAINT "profil_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proses_gaji"
    ADD CONSTRAINT "proses_gaji_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_nomor_po_key" UNIQUE ("nomor_po");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retur_pembelian"
    ADD CONSTRAINT "retur_pembelian_nomor_retur_key" UNIQUE ("nomor_retur");



ALTER TABLE ONLY "public"."retur_pembelian"
    ADD CONSTRAINT "retur_pembelian_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retur_penjualan"
    ADD CONSTRAINT "retur_penjualan_nomor_retur_key" UNIQUE ("nomor_retur");



ALTER TABLE ONLY "public"."retur_penjualan"
    ADD CONSTRAINT "retur_penjualan_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rumus_buku_kas"
    ADD CONSTRAINT "rumus_buku_kas_column_key_key" UNIQUE ("column_key");



ALTER TABLE ONLY "public"."rumus_buku_kas"
    ADD CONSTRAINT "rumus_buku_kas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."satuan_barang"
    ADD CONSTRAINT "satuan_barang_nama_key" UNIQUE ("nama");



ALTER TABLE ONLY "public"."satuan_barang"
    ADD CONSTRAINT "satuan_barang_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."slip_gaji"
    ADD CONSTRAINT "slip_gaji_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spesifikasi_cepat_barang"
    ADD CONSTRAINT "spesifikasi_cepat_barang_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_opname_items"
    ADD CONSTRAINT "stock_opname_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_opnames"
    ADD CONSTRAINT "stock_opnames_nomor_opname_key" UNIQUE ("nomor_opname");



ALTER TABLE ONLY "public"."stock_opnames"
    ADD CONSTRAINT "stock_opnames_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subkategori_barang"
    ADD CONSTRAINT "subkategori_barang_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."surat_jalan"
    ADD CONSTRAINT "surat_jalan_nomor_sj_key" UNIQUE ("nomor_sj");



ALTER TABLE ONLY "public"."surat_jalan"
    ADD CONSTRAINT "surat_jalan_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sync_conflicts"
    ADD CONSTRAINT "sync_conflicts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sync_mutation_registry"
    ADD CONSTRAINT "sync_mutation_registry_client_mutation_id_key" UNIQUE ("client_mutation_id");



ALTER TABLE ONLY "public"."sync_mutation_registry"
    ADD CONSTRAINT "sync_mutation_registry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transaksi_penggantian"
    ADD CONSTRAINT "transaksi_penggantian_pkey" PRIMARY KEY ("transaction_id", "formula_key");



ALTER TABLE ONLY "public"."transaksi_terhitung"
    ADD CONSTRAINT "transaksi_terhitung_pkey" PRIMARY KEY ("transaction_id", "formula_key");



ALTER TABLE ONLY "public"."vendor"
    ADD CONSTRAINT "vendor_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_accounting_periods_status" ON "public"."accounting_periods" USING "btree" ("status", "start_date", "end_date");



CREATE INDEX "idx_audit_log_user" ON "public"."audit_log" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_barang_change_version" ON "public"."barang" USING "btree" ("change_version");



CREATE INDEX "idx_barang_is_deleted" ON "public"."barang" USING "btree" ("is_deleted");



CREATE INDEX "idx_barang_roll_variants_barang" ON "public"."barang_roll_variants" USING "btree" ("barang_id", "aktif_status", "lebar_m");



CREATE INDEX "idx_barang_sync_status" ON "public"."barang" USING "btree" ("sync_status");



CREATE INDEX "idx_barang_updated_at_server" ON "public"."barang" USING "btree" ("updated_at_server");



CREATE INDEX "idx_biaya_tambahan_penjualan_sale" ON "public"."biaya_tambahan_penjualan" USING "btree" ("penjualan_id");



CREATE INDEX "idx_biaya_tambahan_sync_status" ON "public"."biaya_tambahan_penjualan" USING "btree" ("sync_status");



CREATE INDEX "idx_coa_company_type" ON "public"."chart_of_accounts" USING "btree" ("company_id", "account_type");



CREATE INDEX "idx_coa_parent" ON "public"."chart_of_accounts" USING "btree" ("parent_account_id");



CREATE INDEX "idx_finance_category_definitions_active" ON "public"."finance_category_definitions" USING "btree" ("is_active", "display_order");



CREATE INDEX "idx_finance_metric_column_rules_order" ON "public"."finance_metric_column_rules" USING "btree" ("display_order");



CREATE INDEX "idx_finance_metric_mappings_active" ON "public"."finance_metric_mappings" USING "btree" ("is_active", "metric_group", "display_order");



CREATE INDEX "idx_harga_barang_satuan_change_version" ON "public"."harga_barang_satuan" USING "btree" ("change_version");



CREATE INDEX "idx_harga_barang_satuan_is_deleted" ON "public"."harga_barang_satuan" USING "btree" ("is_deleted");



CREATE INDEX "idx_harga_barang_satuan_sync_status" ON "public"."harga_barang_satuan" USING "btree" ("sync_status");



CREATE INDEX "idx_harga_barang_satuan_updated_at_server" ON "public"."harga_barang_satuan" USING "btree" ("updated_at_server");



CREATE INDEX "idx_hutang_pembelian_change_version" ON "public"."hutang_pembelian" USING "btree" ("change_version");



CREATE INDEX "idx_hutang_pembelian_is_deleted" ON "public"."hutang_pembelian" USING "btree" ("is_deleted");



CREATE INDEX "idx_hutang_pembelian_sync_status" ON "public"."hutang_pembelian" USING "btree" ("sync_status");



CREATE INDEX "idx_hutang_pembelian_updated_at_server" ON "public"."hutang_pembelian" USING "btree" ("updated_at_server");



CREATE INDEX "idx_inventory_movements_barang" ON "public"."inventory_movements" USING "btree" ("barang_id", "dibuat_pada");



CREATE INDEX "idx_inventory_movements_change_version" ON "public"."inventory_movements" USING "btree" ("change_version");



CREATE INDEX "idx_inventory_movements_is_deleted" ON "public"."inventory_movements" USING "btree" ("is_deleted");



CREATE INDEX "idx_inventory_movements_line" ON "public"."inventory_movements" USING "btree" ("source_line_id");



CREATE INDEX "idx_inventory_movements_location" ON "public"."inventory_movements" USING "btree" ("location_id");



CREATE INDEX "idx_inventory_movements_roll_variant" ON "public"."inventory_movements" USING "btree" ("roll_variant_id", "dibuat_pada");



CREATE INDEX "idx_inventory_movements_source" ON "public"."inventory_movements" USING "btree" ("source_type", "source_id");



CREATE INDEX "idx_inventory_movements_sync_status" ON "public"."inventory_movements" USING "btree" ("sync_status");



CREATE INDEX "idx_inventory_movements_type" ON "public"."inventory_movements" USING "btree" ("movement_type");



CREATE INDEX "idx_inventory_movements_updated_at_server" ON "public"."inventory_movements" USING "btree" ("updated_at_server");



CREATE INDEX "idx_item_finishing_change_version" ON "public"."item_finishing" USING "btree" ("change_version");



CREATE INDEX "idx_item_finishing_is_deleted" ON "public"."item_finishing" USING "btree" ("is_deleted");



CREATE INDEX "idx_item_finishing_item" ON "public"."item_finishing" USING "btree" ("item_produksi_id");



CREATE INDEX "idx_item_finishing_sync_status" ON "public"."item_finishing" USING "btree" ("sync_status");



CREATE INDEX "idx_item_finishing_updated_at_server" ON "public"."item_finishing" USING "btree" ("updated_at_server");



CREATE INDEX "idx_item_pembelian_change_version" ON "public"."item_pembelian" USING "btree" ("change_version");



CREATE INDEX "idx_item_pembelian_is_deleted" ON "public"."item_pembelian" USING "btree" ("is_deleted");



CREATE INDEX "idx_item_pembelian_po_item" ON "public"."item_pembelian" USING "btree" ("purchase_order_item_id");



CREATE INDEX "idx_item_pembelian_sync_status" ON "public"."item_pembelian" USING "btree" ("sync_status");



CREATE INDEX "idx_item_pembelian_updated_at_server" ON "public"."item_pembelian" USING "btree" ("updated_at_server");



CREATE INDEX "idx_item_penawaran_doc" ON "public"."item_penawaran" USING "btree" ("penawaran_id");



CREATE INDEX "idx_item_penjualan_change_version" ON "public"."item_penjualan" USING "btree" ("change_version");



CREATE INDEX "idx_item_penjualan_is_deleted" ON "public"."item_penjualan" USING "btree" ("is_deleted");



CREATE INDEX "idx_item_penjualan_pembelian_terkait" ON "public"."item_penjualan" USING "btree" ("pembelian_id_terkait");



CREATE INDEX "idx_item_penjualan_sync_status" ON "public"."item_penjualan" USING "btree" ("sync_status");



CREATE INDEX "idx_item_penjualan_tipe_item" ON "public"."item_penjualan" USING "btree" ("tipe_item");



CREATE INDEX "idx_item_penjualan_updated_at_server" ON "public"."item_penjualan" USING "btree" ("updated_at_server");



CREATE INDEX "idx_item_produksi_change_version" ON "public"."item_produksi" USING "btree" ("change_version");



CREATE INDEX "idx_item_produksi_is_deleted" ON "public"."item_produksi" USING "btree" ("is_deleted");



CREATE INDEX "idx_item_produksi_order" ON "public"."item_produksi" USING "btree" ("order_produksi_id");



CREATE INDEX "idx_item_produksi_status" ON "public"."item_produksi" USING "btree" ("status");



CREATE INDEX "idx_item_produksi_sync_status" ON "public"."item_produksi" USING "btree" ("sync_status");



CREATE INDEX "idx_item_produksi_updated_at_server" ON "public"."item_produksi" USING "btree" ("updated_at_server");



CREATE INDEX "idx_item_retur_pembelian_doc" ON "public"."item_retur_pembelian" USING "btree" ("retur_pembelian_id");



CREATE INDEX "idx_item_retur_pembelian_source" ON "public"."item_retur_pembelian" USING "btree" ("item_pembelian_id");



CREATE INDEX "idx_item_retur_penjualan_doc" ON "public"."item_retur_penjualan" USING "btree" ("retur_penjualan_id");



CREATE INDEX "idx_item_retur_penjualan_source" ON "public"."item_retur_penjualan" USING "btree" ("item_penjualan_id");



CREATE INDEX "idx_item_surat_jalan_sj" ON "public"."item_surat_jalan" USING "btree" ("surat_jalan_id");



CREATE INDEX "idx_item_surat_jalan_sync_status" ON "public"."item_surat_jalan" USING "btree" ("sync_status");



CREATE INDEX "idx_journal_entries_date" ON "public"."journal_entries" USING "btree" ("entry_date");



CREATE INDEX "idx_journal_entries_source" ON "public"."journal_entries" USING "btree" ("source_type", "source_id");



CREATE INDEX "idx_journal_entries_sync_status" ON "public"."journal_entries" USING "btree" ("sync_status");



CREATE INDEX "idx_journal_lines_account" ON "public"."journal_entry_lines" USING "btree" ("account_id");



CREATE INDEX "idx_journal_lines_entry" ON "public"."journal_entry_lines" USING "btree" ("journal_entry_id");



CREATE INDEX "idx_kategori_barang_change_version" ON "public"."kategori_barang" USING "btree" ("change_version");



CREATE INDEX "idx_kategori_barang_is_deleted" ON "public"."kategori_barang" USING "btree" ("is_deleted");



CREATE INDEX "idx_kategori_barang_nama" ON "public"."kategori_barang" USING "btree" ("nama");



CREATE INDEX "idx_kategori_barang_sync_status" ON "public"."kategori_barang" USING "btree" ("sync_status");



CREATE INDEX "idx_kategori_barang_updated_at_server" ON "public"."kategori_barang" USING "btree" ("updated_at_server");



CREATE INDEX "idx_keuangan_change_version" ON "public"."keuangan" USING "btree" ("change_version");



CREATE INDEX "idx_keuangan_is_deleted" ON "public"."keuangan" USING "btree" ("is_deleted");



CREATE INDEX "idx_keuangan_reference" ON "public"."keuangan" USING "btree" ("reference_type", "reference_id");



CREATE INDEX "idx_keuangan_status_transaksi" ON "public"."keuangan" USING "btree" ("status_transaksi");



CREATE INDEX "idx_keuangan_sync_status" ON "public"."keuangan" USING "btree" ("sync_status");



CREATE INDEX "idx_keuangan_updated_at_server" ON "public"."keuangan" USING "btree" ("updated_at_server");



CREATE INDEX "idx_komponen_kompensasi_actor" ON "public"."komponen_kompensasi" USING "btree" ("actor_id");



CREATE INDEX "idx_komponen_kompensasi_aktif" ON "public"."komponen_kompensasi" USING "btree" ("aktif_status");



CREATE INDEX "idx_komponen_kompensasi_sync" ON "public"."komponen_kompensasi" USING "btree" ("sync_status");



CREATE INDEX "idx_kredensial_change_version" ON "public"."kredensial" USING "btree" ("change_version");



CREATE INDEX "idx_kredensial_is_deleted" ON "public"."kredensial" USING "btree" ("is_deleted");



CREATE INDEX "idx_kredensial_owner" ON "public"."kredensial" USING "btree" ("pemilik_id");



CREATE INDEX "idx_kredensial_service" ON "public"."kredensial" USING "btree" ("nama_layanan");



CREATE INDEX "idx_kredensial_sync_status" ON "public"."kredensial" USING "btree" ("sync_status");



CREATE INDEX "idx_kredensial_updated_at_server" ON "public"."kredensial" USING "btree" ("updated_at_server");



CREATE INDEX "idx_nsfp_pool_penjualan" ON "public"."nsfp_pool" USING "btree" ("penjualan_id");



CREATE INDEX "idx_nsfp_pool_status" ON "public"."nsfp_pool" USING "btree" ("status", "tahun", "nomor_seri");



CREATE INDEX "idx_opsi_finishing_aktif" ON "public"."opsi_finishing" USING "btree" ("aktif_status", "urutan_tampilan");



CREATE INDEX "idx_opsi_finishing_change_version" ON "public"."opsi_finishing" USING "btree" ("change_version");



CREATE INDEX "idx_opsi_finishing_is_deleted" ON "public"."opsi_finishing" USING "btree" ("is_deleted");



CREATE INDEX "idx_opsi_finishing_sync_status" ON "public"."opsi_finishing" USING "btree" ("sync_status");



CREATE INDEX "idx_opsi_finishing_updated_at_server" ON "public"."opsi_finishing" USING "btree" ("updated_at_server");



CREATE INDEX "idx_order_produksi_change_version" ON "public"."order_produksi" USING "btree" ("change_version");



CREATE INDEX "idx_order_produksi_is_deleted" ON "public"."order_produksi" USING "btree" ("is_deleted");



CREATE INDEX "idx_order_produksi_penjualan" ON "public"."order_produksi" USING "btree" ("penjualan_id");



CREATE INDEX "idx_order_produksi_status" ON "public"."order_produksi" USING "btree" ("status");



CREATE INDEX "idx_order_produksi_sync_status" ON "public"."order_produksi" USING "btree" ("sync_status");



CREATE INDEX "idx_order_produksi_updated_at_server" ON "public"."order_produksi" USING "btree" ("updated_at_server");



CREATE INDEX "idx_pegawai_active" ON "public"."pegawai" USING "btree" ("is_active");



CREATE INDEX "idx_pegawai_order" ON "public"."pegawai" USING "btree" ("display_order");



CREATE INDEX "idx_pegawai_role" ON "public"."pegawai" USING "btree" ("role_code");



CREATE INDEX "idx_pelanggan_change_version" ON "public"."pelanggan" USING "btree" ("change_version");



CREATE INDEX "idx_pelanggan_is_deleted" ON "public"."pelanggan" USING "btree" ("is_deleted");



CREATE INDEX "idx_pelanggan_sync_status" ON "public"."pelanggan" USING "btree" ("sync_status");



CREATE INDEX "idx_pelanggan_updated_at_server" ON "public"."pelanggan" USING "btree" ("updated_at_server");



CREATE INDEX "idx_pelunasan_hutang_change_version" ON "public"."pelunasan_hutang" USING "btree" ("change_version");



CREATE INDEX "idx_pelunasan_hutang_is_deleted" ON "public"."pelunasan_hutang" USING "btree" ("is_deleted");



CREATE INDEX "idx_pelunasan_hutang_sync_status" ON "public"."pelunasan_hutang" USING "btree" ("sync_status");



CREATE INDEX "idx_pelunasan_hutang_updated_at_server" ON "public"."pelunasan_hutang" USING "btree" ("updated_at_server");



CREATE INDEX "idx_pelunasan_piutang_change_version" ON "public"."pelunasan_piutang" USING "btree" ("change_version");



CREATE INDEX "idx_pelunasan_piutang_date" ON "public"."pelunasan_piutang" USING "btree" ("tanggal_bayar");



CREATE INDEX "idx_pelunasan_piutang_is_deleted" ON "public"."pelunasan_piutang" USING "btree" ("is_deleted");



CREATE INDEX "idx_pelunasan_piutang_sync_status" ON "public"."pelunasan_piutang" USING "btree" ("sync_status");



CREATE INDEX "idx_pelunasan_piutang_updated_at_server" ON "public"."pelunasan_piutang" USING "btree" ("updated_at_server");



CREATE INDEX "idx_pembelian_change_version" ON "public"."pembelian" USING "btree" ("change_version");



CREATE INDEX "idx_pembelian_dapat_dikreditkan" ON "public"."pembelian" USING "btree" ("dapat_dikreditkan");



CREATE INDEX "idx_pembelian_is_deleted" ON "public"."pembelian" USING "btree" ("is_deleted");



CREATE INDEX "idx_pembelian_kena_ppn" ON "public"."pembelian" USING "btree" ("kena_ppn");



CREATE INDEX "idx_pembelian_penjualan_sumber" ON "public"."pembelian" USING "btree" ("penjualan_id_sumber");



CREATE INDEX "idx_pembelian_purchase_order" ON "public"."pembelian" USING "btree" ("purchase_order_id");



CREATE INDEX "idx_pembelian_status_transaksi" ON "public"."pembelian" USING "btree" ("status_transaksi");



CREATE INDEX "idx_pembelian_sync_status" ON "public"."pembelian" USING "btree" ("sync_status");



CREATE INDEX "idx_pembelian_tanggal_faktur_pajak" ON "public"."pembelian" USING "btree" ("tanggal_faktur_pajak");



CREATE INDEX "idx_pembelian_tipe" ON "public"."pembelian" USING "btree" ("tipe_pembelian");
CREATE INDEX "idx_pembelian_periode_id" ON "public"."pembelian" USING "btree" ("periode_id");



CREATE INDEX "idx_pembelian_updated_at_server" ON "public"."pembelian" USING "btree" ("updated_at_server");



CREATE INDEX "idx_penawaran_pelanggan" ON "public"."penawaran" USING "btree" ("pelanggan_id");



CREATE INDEX "idx_penawaran_status" ON "public"."penawaran" USING "btree" ("status", "tanggal");



CREATE INDEX "idx_penjualan_change_version" ON "public"."penjualan" USING "btree" ("change_version");



CREATE INDEX "idx_penjualan_is_deleted" ON "public"."penjualan" USING "btree" ("is_deleted");



CREATE INDEX "idx_penjualan_kena_ppn" ON "public"."penjualan" USING "btree" ("kena_ppn");



CREATE INDEX "idx_penjualan_penawaran" ON "public"."penjualan" USING "btree" ("penawaran_id");



CREATE INDEX "idx_penjualan_status_transaksi" ON "public"."penjualan" USING "btree" ("status_transaksi");



CREATE INDEX "idx_penjualan_sync_status" ON "public"."penjualan" USING "btree" ("sync_status");



CREATE INDEX "idx_penjualan_tanggal_faktur_pajak" ON "public"."penjualan" USING "btree" ("tanggal_faktur_pajak");



CREATE INDEX "idx_penjualan_updated_at_server" ON "public"."penjualan" USING "btree" ("updated_at_server");
CREATE INDEX "idx_penjualan_periode_id" ON "public"."penjualan" USING "btree" ("periode_id");



CREATE INDEX "idx_peran_pegawai_group" ON "public"."peran_pegawai" USING "btree" ("role_group");



CREATE INDEX "idx_peran_pegawai_order" ON "public"."peran_pegawai" USING "btree" ("display_order");



CREATE INDEX "idx_pinjaman_karyawan_actor" ON "public"."pinjaman_karyawan" USING "btree" ("actor_id");



CREATE INDEX "idx_pinjaman_karyawan_jenis" ON "public"."pinjaman_karyawan" USING "btree" ("jenis");



CREATE INDEX "idx_pinjaman_karyawan_run" ON "public"."pinjaman_karyawan" USING "btree" ("proses_gaji_id");



CREATE INDEX "idx_pinjaman_karyawan_sync" ON "public"."pinjaman_karyawan" USING "btree" ("sync_status");



CREATE INDEX "idx_piutang_penjualan_change_version" ON "public"."piutang_penjualan" USING "btree" ("change_version");



CREATE INDEX "idx_piutang_penjualan_date" ON "public"."piutang_penjualan" USING "btree" ("dibuat_pada");



CREATE INDEX "idx_piutang_penjualan_is_deleted" ON "public"."piutang_penjualan" USING "btree" ("is_deleted");



CREATE INDEX "idx_piutang_penjualan_status" ON "public"."piutang_penjualan" USING "btree" ("status");



CREATE INDEX "idx_piutang_penjualan_sync_status" ON "public"."piutang_penjualan" USING "btree" ("sync_status");



CREATE INDEX "idx_piutang_penjualan_updated_at_server" ON "public"."piutang_penjualan" USING "btree" ("updated_at_server");



CREATE INDEX "idx_production_consumptions_item" ON "public"."production_material_consumptions" USING "btree" ("item_produksi_id", "status");



CREATE INDEX "idx_production_consumptions_roll" ON "public"."production_material_consumptions" USING "btree" ("roll_variant_id", "dibuat_pada");



CREATE INDEX "idx_profil_change_version" ON "public"."profil" USING "btree" ("change_version");



CREATE INDEX "idx_profil_is_deleted" ON "public"."profil" USING "btree" ("is_deleted");



CREATE INDEX "idx_profil_sync_status" ON "public"."profil" USING "btree" ("sync_status");



CREATE INDEX "idx_profil_updated_at_server" ON "public"."profil" USING "btree" ("updated_at_server");



CREATE INDEX "idx_proses_gaji_periode" ON "public"."proses_gaji" USING "btree" ("periode");



CREATE INDEX "idx_proses_gaji_status" ON "public"."proses_gaji" USING "btree" ("status");



CREATE INDEX "idx_proses_gaji_sync" ON "public"."proses_gaji" USING "btree" ("sync_status");



CREATE INDEX "idx_purchase_order_items_doc" ON "public"."purchase_order_items" USING "btree" ("purchase_order_id");



CREATE INDEX "idx_purchase_orders_status" ON "public"."purchase_orders" USING "btree" ("status", "tanggal");



CREATE INDEX "idx_purchase_orders_vendor" ON "public"."purchase_orders" USING "btree" ("vendor_id");



CREATE INDEX "idx_retur_pembelian_purchase" ON "public"."retur_pembelian" USING "btree" ("pembelian_id", "tanggal");



CREATE INDEX "idx_retur_penjualan_sale" ON "public"."retur_penjualan" USING "btree" ("penjualan_id", "tanggal");



CREATE INDEX "idx_rumus_buku_kas_actor" ON "public"."rumus_buku_kas" USING "btree" ("actor_id");



CREATE INDEX "idx_rumus_buku_kas_group" ON "public"."rumus_buku_kas" USING "btree" ("formula_group");



CREATE INDEX "idx_rumus_buku_kas_key" ON "public"."rumus_buku_kas" USING "btree" ("formula_key");



CREATE INDEX "idx_rumus_buku_kas_order" ON "public"."rumus_buku_kas" USING "btree" ("display_order");



CREATE INDEX "idx_rumus_buku_kas_visible" ON "public"."rumus_buku_kas" USING "btree" ("is_visible_in_summary");



CREATE INDEX "idx_satuan_barang_change_version" ON "public"."satuan_barang" USING "btree" ("change_version");



CREATE INDEX "idx_satuan_barang_is_deleted" ON "public"."satuan_barang" USING "btree" ("is_deleted");



CREATE INDEX "idx_satuan_barang_nama" ON "public"."satuan_barang" USING "btree" ("nama");



CREATE INDEX "idx_satuan_barang_sync_status" ON "public"."satuan_barang" USING "btree" ("sync_status");



CREATE INDEX "idx_satuan_barang_updated_at_server" ON "public"."satuan_barang" USING "btree" ("updated_at_server");



CREATE INDEX "idx_slip_gaji_actor" ON "public"."slip_gaji" USING "btree" ("actor_id");



CREATE INDEX "idx_slip_gaji_run" ON "public"."slip_gaji" USING "btree" ("proses_gaji_id");



CREATE INDEX "idx_slip_gaji_status" ON "public"."slip_gaji" USING "btree" ("status");



CREATE INDEX "idx_slip_gaji_sync" ON "public"."slip_gaji" USING "btree" ("sync_status");



CREATE INDEX "idx_spesifikasi_cepat_barang_change_version" ON "public"."spesifikasi_cepat_barang" USING "btree" ("change_version");



CREATE INDEX "idx_spesifikasi_cepat_barang_is_deleted" ON "public"."spesifikasi_cepat_barang" USING "btree" ("is_deleted");



CREATE INDEX "idx_spesifikasi_cepat_barang_sync_status" ON "public"."spesifikasi_cepat_barang" USING "btree" ("sync_status");



CREATE INDEX "idx_spesifikasi_cepat_barang_updated_at_server" ON "public"."spesifikasi_cepat_barang" USING "btree" ("updated_at_server");



CREATE INDEX "idx_spesifikasi_cepat_kategori" ON "public"."spesifikasi_cepat_barang" USING "btree" ("kategori_id");



CREATE INDEX "idx_stock_opname_items_barang" ON "public"."stock_opname_items" USING "btree" ("barang_id");



CREATE INDEX "idx_stock_opname_items_doc" ON "public"."stock_opname_items" USING "btree" ("stock_opname_id");



CREATE INDEX "idx_stock_opnames_status" ON "public"."stock_opnames" USING "btree" ("status", "tanggal");



CREATE INDEX "idx_subkategori_barang_change_version" ON "public"."subkategori_barang" USING "btree" ("change_version");



CREATE INDEX "idx_subkategori_barang_is_deleted" ON "public"."subkategori_barang" USING "btree" ("is_deleted");



CREATE INDEX "idx_subkategori_barang_kategori" ON "public"."subkategori_barang" USING "btree" ("kategori_id");



CREATE INDEX "idx_subkategori_barang_nama" ON "public"."subkategori_barang" USING "btree" ("nama");



CREATE INDEX "idx_subkategori_barang_sync_status" ON "public"."subkategori_barang" USING "btree" ("sync_status");



CREATE INDEX "idx_subkategori_barang_updated_at_server" ON "public"."subkategori_barang" USING "btree" ("updated_at_server");



CREATE INDEX "idx_surat_jalan_penjualan" ON "public"."surat_jalan" USING "btree" ("penjualan_id");



CREATE INDEX "idx_surat_jalan_status" ON "public"."surat_jalan" USING "btree" ("status");



CREATE INDEX "idx_surat_jalan_sync_status" ON "public"."surat_jalan" USING "btree" ("sync_status");



CREATE INDEX "idx_surat_jalan_tanggal" ON "public"."surat_jalan" USING "btree" ("tanggal" DESC);



CREATE INDEX "idx_sync_conflicts_table_record" ON "public"."sync_conflicts" USING "btree" ("table_name", "record_id", "created_at" DESC);



CREATE INDEX "idx_sync_mutation_registry_table_record" ON "public"."sync_mutation_registry" USING "btree" ("table_name", "record_id", "processed_at" DESC);



CREATE INDEX "idx_transaksi_penggantian_formula_key" ON "public"."transaksi_penggantian" USING "btree" ("formula_key");



CREATE INDEX "idx_transaksi_terhitung_formula_key" ON "public"."transaksi_terhitung" USING "btree" ("formula_key");



CREATE INDEX "idx_transaksi_terhitung_transaction" ON "public"."transaksi_terhitung" USING "btree" ("transaction_id");



CREATE INDEX "idx_vendor_change_version" ON "public"."vendor" USING "btree" ("change_version");



CREATE INDEX "idx_vendor_is_deleted" ON "public"."vendor" USING "btree" ("is_deleted");



CREATE INDEX "idx_vendor_sync_status" ON "public"."vendor" USING "btree" ("sync_status");



CREATE INDEX "idx_vendor_tipe" ON "public"."vendor" USING "btree" ("tipe_vendor");



CREATE INDEX "idx_vendor_updated_at_server" ON "public"."vendor" USING "btree" ("updated_at_server");



CREATE OR REPLACE TRIGGER "update_barang_diperbarui_pada" BEFORE UPDATE ON "public"."barang" FOR EACH ROW EXECUTE FUNCTION "public"."update_diperbarui_pada"();



CREATE OR REPLACE TRIGGER "update_harga_barang_satuan_diperbarui_pada" BEFORE UPDATE ON "public"."harga_barang_satuan" FOR EACH ROW EXECUTE FUNCTION "public"."update_diperbarui_pada"();



CREATE OR REPLACE TRIGGER "update_hutang_pembelian_diperbarui_pada" BEFORE UPDATE ON "public"."hutang_pembelian" FOR EACH ROW EXECUTE FUNCTION "public"."update_diperbarui_pada"();



CREATE OR REPLACE TRIGGER "update_item_finishing_diperbarui_pada" BEFORE UPDATE ON "public"."item_finishing" FOR EACH ROW EXECUTE FUNCTION "public"."update_diperbarui_pada"();



CREATE OR REPLACE TRIGGER "update_item_produksi_diperbarui_pada" BEFORE UPDATE ON "public"."item_produksi" FOR EACH ROW EXECUTE FUNCTION "public"."update_diperbarui_pada"();



CREATE OR REPLACE TRIGGER "update_kategori_barang_diperbarui_pada" BEFORE UPDATE ON "public"."kategori_barang" FOR EACH ROW EXECUTE FUNCTION "public"."update_diperbarui_pada"();



CREATE OR REPLACE TRIGGER "update_kredensial_diperbarui_pada" BEFORE UPDATE ON "public"."kredensial" FOR EACH ROW EXECUTE FUNCTION "public"."update_diperbarui_pada"();



CREATE OR REPLACE TRIGGER "update_opsi_finishing_diperbarui_pada" BEFORE UPDATE ON "public"."opsi_finishing" FOR EACH ROW EXECUTE FUNCTION "public"."update_diperbarui_pada"();



CREATE OR REPLACE TRIGGER "update_order_produksi_diperbarui_pada" BEFORE UPDATE ON "public"."order_produksi" FOR EACH ROW EXECUTE FUNCTION "public"."update_diperbarui_pada"();



CREATE OR REPLACE TRIGGER "update_pelanggan_diperbarui_pada" BEFORE UPDATE ON "public"."pelanggan" FOR EACH ROW EXECUTE FUNCTION "public"."update_diperbarui_pada"();



CREATE OR REPLACE TRIGGER "update_pembelian_diperbarui_pada" BEFORE UPDATE ON "public"."pembelian" FOR EACH ROW EXECUTE FUNCTION "public"."update_diperbarui_pada"();



CREATE OR REPLACE TRIGGER "update_penjualan_diperbarui_pada" BEFORE UPDATE ON "public"."penjualan" FOR EACH ROW EXECUTE FUNCTION "public"."update_diperbarui_pada"();



CREATE OR REPLACE TRIGGER "update_piutang_penjualan_diperbarui_pada" BEFORE UPDATE ON "public"."piutang_penjualan" FOR EACH ROW EXECUTE FUNCTION "public"."update_diperbarui_pada"();



CREATE OR REPLACE TRIGGER "update_profil_diperbarui_pada" BEFORE UPDATE ON "public"."profil" FOR EACH ROW EXECUTE FUNCTION "public"."update_diperbarui_pada"();



CREATE OR REPLACE TRIGGER "update_satuan_barang_diperbarui_pada" BEFORE UPDATE ON "public"."satuan_barang" FOR EACH ROW EXECUTE FUNCTION "public"."update_diperbarui_pada"();



CREATE OR REPLACE TRIGGER "update_spesifikasi_cepat_barang_diperbarui_pada" BEFORE UPDATE ON "public"."spesifikasi_cepat_barang" FOR EACH ROW EXECUTE FUNCTION "public"."update_diperbarui_pada"();



CREATE OR REPLACE TRIGGER "update_subkategori_barang_diperbarui_pada" BEFORE UPDATE ON "public"."subkategori_barang" FOR EACH ROW EXECUTE FUNCTION "public"."update_diperbarui_pada"();



CREATE OR REPLACE TRIGGER "update_vendor_diperbarui_pada" BEFORE UPDATE ON "public"."vendor" FOR EACH ROW EXECUTE FUNCTION "public"."update_diperbarui_pada"();



ALTER TABLE ONLY "public"."accounting_periods"
    ADD CONSTRAINT "accounting_periods_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "public"."profil"("id");



ALTER TABLE ONLY "public"."accounting_posting_rules"
    ADD CONSTRAINT "accounting_posting_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."barang"
    ADD CONSTRAINT "barang_kategori_id_fkey" FOREIGN KEY ("kategori_id") REFERENCES "public"."kategori_barang"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."barang_roll_variants"
    ADD CONSTRAINT "barang_roll_variants_barang_id_fkey" FOREIGN KEY ("barang_id") REFERENCES "public"."barang"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."barang"
    ADD CONSTRAINT "barang_subkategori_id_fkey" FOREIGN KEY ("subkategori_id") REFERENCES "public"."subkategori_barang"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."biaya_tambahan_penjualan"
    ADD CONSTRAINT "biaya_tambahan_penjualan_penjualan_id_fkey" FOREIGN KEY ("penjualan_id") REFERENCES "public"."penjualan"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_parent_account_id_fkey" FOREIGN KEY ("parent_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fiscal_periods"
    ADD CONSTRAINT "fiscal_periods_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."harga_barang_satuan"
    ADD CONSTRAINT "harga_barang_satuan_barang_id_fkey" FOREIGN KEY ("barang_id") REFERENCES "public"."barang"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hutang_pembelian"
    ADD CONSTRAINT "hutang_pembelian_id_pembelian_fkey" FOREIGN KEY ("id_pembelian") REFERENCES "public"."pembelian"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_barang_id_fkey" FOREIGN KEY ("barang_id") REFERENCES "public"."barang"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_dibuat_oleh_fkey" FOREIGN KEY ("dibuat_oleh") REFERENCES "public"."profil"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "public"."inventory_movements"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_roll_variant_id_fkey" FOREIGN KEY ("roll_variant_id") REFERENCES "public"."barang_roll_variants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."item_finishing"
    ADD CONSTRAINT "item_finishing_item_produksi_id_fkey" FOREIGN KEY ("item_produksi_id") REFERENCES "public"."item_produksi"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_finishing"
    ADD CONSTRAINT "item_finishing_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "public"."profil"("id");



ALTER TABLE ONLY "public"."item_pembelian"
    ADD CONSTRAINT "item_pembelian_barang_id_fkey" FOREIGN KEY ("barang_id") REFERENCES "public"."barang"("id");



ALTER TABLE ONLY "public"."item_pembelian"
    ADD CONSTRAINT "item_pembelian_harga_satuan_id_fkey" FOREIGN KEY ("harga_satuan_id") REFERENCES "public"."harga_barang_satuan"("id");



ALTER TABLE ONLY "public"."item_pembelian"
    ADD CONSTRAINT "item_pembelian_pembelian_id_fkey" FOREIGN KEY ("pembelian_id") REFERENCES "public"."pembelian"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_pembelian"
    ADD CONSTRAINT "item_pembelian_purchase_order_item_id_fkey" FOREIGN KEY ("purchase_order_item_id") REFERENCES "public"."purchase_order_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."item_penawaran"
    ADD CONSTRAINT "item_penawaran_barang_id_fkey" FOREIGN KEY ("barang_id") REFERENCES "public"."barang"("id");



ALTER TABLE ONLY "public"."item_penawaran"
    ADD CONSTRAINT "item_penawaran_harga_satuan_id_fkey" FOREIGN KEY ("harga_satuan_id") REFERENCES "public"."harga_barang_satuan"("id");



ALTER TABLE ONLY "public"."item_penawaran"
    ADD CONSTRAINT "item_penawaran_penawaran_id_fkey" FOREIGN KEY ("penawaran_id") REFERENCES "public"."penawaran"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_penawaran"
    ADD CONSTRAINT "item_penawaran_vendor_subkontrak_id_fkey" FOREIGN KEY ("vendor_subkontrak_id") REFERENCES "public"."vendor"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."item_penjualan"
    ADD CONSTRAINT "item_penjualan_barang_id_fkey" FOREIGN KEY ("barang_id") REFERENCES "public"."barang"("id");



ALTER TABLE ONLY "public"."item_penjualan"
    ADD CONSTRAINT "item_penjualan_harga_satuan_id_fkey" FOREIGN KEY ("harga_satuan_id") REFERENCES "public"."harga_barang_satuan"("id");



ALTER TABLE ONLY "public"."item_penjualan"
    ADD CONSTRAINT "item_penjualan_pembelian_id_terkait_fkey" FOREIGN KEY ("pembelian_id_terkait") REFERENCES "public"."pembelian"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."item_penjualan"
    ADD CONSTRAINT "item_penjualan_penjualan_id_fkey" FOREIGN KEY ("penjualan_id") REFERENCES "public"."penjualan"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_penjualan"
    ADD CONSTRAINT "item_penjualan_vendor_subkontrak_id_fkey" FOREIGN KEY ("vendor_subkontrak_id") REFERENCES "public"."vendor"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."item_produksi"
    ADD CONSTRAINT "item_produksi_barang_id_fkey" FOREIGN KEY ("barang_id") REFERENCES "public"."barang"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."item_produksi"
    ADD CONSTRAINT "item_produksi_item_penjualan_id_fkey" FOREIGN KEY ("item_penjualan_id") REFERENCES "public"."item_penjualan"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_produksi"
    ADD CONSTRAINT "item_produksi_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "public"."profil"("id");



ALTER TABLE ONLY "public"."item_produksi"
    ADD CONSTRAINT "item_produksi_order_produksi_id_fkey" FOREIGN KEY ("order_produksi_id") REFERENCES "public"."order_produksi"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_retur_pembelian"
    ADD CONSTRAINT "item_retur_pembelian_barang_id_fkey" FOREIGN KEY ("barang_id") REFERENCES "public"."barang"("id");



ALTER TABLE ONLY "public"."item_retur_pembelian"
    ADD CONSTRAINT "item_retur_pembelian_item_pembelian_id_fkey" FOREIGN KEY ("item_pembelian_id") REFERENCES "public"."item_pembelian"("id");



ALTER TABLE ONLY "public"."item_retur_pembelian"
    ADD CONSTRAINT "item_retur_pembelian_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "public"."inventory_movements"("id");



ALTER TABLE ONLY "public"."item_retur_pembelian"
    ADD CONSTRAINT "item_retur_pembelian_retur_pembelian_id_fkey" FOREIGN KEY ("retur_pembelian_id") REFERENCES "public"."retur_pembelian"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_retur_penjualan"
    ADD CONSTRAINT "item_retur_penjualan_barang_id_fkey" FOREIGN KEY ("barang_id") REFERENCES "public"."barang"("id");



ALTER TABLE ONLY "public"."item_retur_penjualan"
    ADD CONSTRAINT "item_retur_penjualan_item_penjualan_id_fkey" FOREIGN KEY ("item_penjualan_id") REFERENCES "public"."item_penjualan"("id");



ALTER TABLE ONLY "public"."item_retur_penjualan"
    ADD CONSTRAINT "item_retur_penjualan_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "public"."inventory_movements"("id");



ALTER TABLE ONLY "public"."item_retur_penjualan"
    ADD CONSTRAINT "item_retur_penjualan_retur_penjualan_id_fkey" FOREIGN KEY ("retur_penjualan_id") REFERENCES "public"."retur_penjualan"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_surat_jalan"
    ADD CONSTRAINT "item_surat_jalan_surat_jalan_id_fkey" FOREIGN KEY ("surat_jalan_id") REFERENCES "public"."surat_jalan"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "public"."fiscal_periods"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."komponen_kompensasi"
    ADD CONSTRAINT "komponen_kompensasi_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."pegawai"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kredensial"
    ADD CONSTRAINT "kredensial_pemilik_id_fkey" FOREIGN KEY ("pemilik_id") REFERENCES "public"."profil"("id");



ALTER TABLE ONLY "public"."order_produksi"
    ADD CONSTRAINT "order_produksi_dibuat_oleh_fkey" FOREIGN KEY ("dibuat_oleh") REFERENCES "public"."profil"("id");



ALTER TABLE ONLY "public"."order_produksi"
    ADD CONSTRAINT "order_produksi_penjualan_id_fkey" FOREIGN KEY ("penjualan_id") REFERENCES "public"."penjualan"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pegawai"
    ADD CONSTRAINT "pegawai_role_code_fkey" FOREIGN KEY ("role_code") REFERENCES "public"."peran_pegawai"("role_code") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."pelunasan_hutang"
    ADD CONSTRAINT "pelunasan_hutang_dibuat_oleh_fkey" FOREIGN KEY ("dibuat_oleh") REFERENCES "public"."profil"("id");



ALTER TABLE ONLY "public"."pelunasan_hutang"
    ADD CONSTRAINT "pelunasan_hutang_id_hutang_fkey" FOREIGN KEY ("id_hutang") REFERENCES "public"."hutang_pembelian"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pelunasan_piutang"
    ADD CONSTRAINT "pelunasan_piutang_dibuat_oleh_fkey" FOREIGN KEY ("dibuat_oleh") REFERENCES "public"."profil"("id");



ALTER TABLE ONLY "public"."pelunasan_piutang"
    ADD CONSTRAINT "pelunasan_piutang_id_piutang_fkey" FOREIGN KEY ("id_piutang") REFERENCES "public"."piutang_penjualan"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pembelian"
    ADD CONSTRAINT "pembelian_dibuat_oleh_fkey" FOREIGN KEY ("dibuat_oleh") REFERENCES "public"."profil"("id");



ALTER TABLE ONLY "public"."pembelian"
    ADD CONSTRAINT "pembelian_penjualan_id_sumber_fkey" FOREIGN KEY ("penjualan_id_sumber") REFERENCES "public"."penjualan"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pembelian"
    ADD CONSTRAINT "pembelian_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pembelian"
    ADD CONSTRAINT "pembelian_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id");



ALTER TABLE ONLY "public"."penawaran"
    ADD CONSTRAINT "penawaran_converted_penjualan_id_fkey" FOREIGN KEY ("converted_penjualan_id") REFERENCES "public"."penjualan"("id");



ALTER TABLE ONLY "public"."penawaran"
    ADD CONSTRAINT "penawaran_dibuat_oleh_fkey" FOREIGN KEY ("dibuat_oleh") REFERENCES "public"."profil"("id");



ALTER TABLE ONLY "public"."penawaran"
    ADD CONSTRAINT "penawaran_pelanggan_id_fkey" FOREIGN KEY ("pelanggan_id") REFERENCES "public"."pelanggan"("id");



ALTER TABLE ONLY "public"."penjualan"
    ADD CONSTRAINT "penjualan_kasir_id_fkey" FOREIGN KEY ("kasir_id") REFERENCES "public"."profil"("id");



ALTER TABLE ONLY "public"."penjualan"
    ADD CONSTRAINT "penjualan_pelanggan_id_fkey" FOREIGN KEY ("pelanggan_id") REFERENCES "public"."pelanggan"("id");



ALTER TABLE ONLY "public"."penjualan"
    ADD CONSTRAINT "penjualan_penawaran_id_fkey" FOREIGN KEY ("penawaran_id") REFERENCES "public"."penawaran"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pinjaman_karyawan"
    ADD CONSTRAINT "pinjaman_karyawan_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."pegawai"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pinjaman_karyawan"
    ADD CONSTRAINT "pinjaman_karyawan_proses_gaji_id_fkey" FOREIGN KEY ("proses_gaji_id") REFERENCES "public"."proses_gaji"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."piutang_penjualan"
    ADD CONSTRAINT "piutang_penjualan_id_penjualan_fkey" FOREIGN KEY ("id_penjualan") REFERENCES "public"."penjualan"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."production_material_consumptions"
    ADD CONSTRAINT "production_material_consumptions_barang_id_fkey" FOREIGN KEY ("barang_id") REFERENCES "public"."barang"("id");



ALTER TABLE ONLY "public"."production_material_consumptions"
    ADD CONSTRAINT "production_material_consumptions_item_penjualan_id_fkey" FOREIGN KEY ("item_penjualan_id") REFERENCES "public"."item_penjualan"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."production_material_consumptions"
    ADD CONSTRAINT "production_material_consumptions_item_produksi_id_fkey" FOREIGN KEY ("item_produksi_id") REFERENCES "public"."item_produksi"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."production_material_consumptions"
    ADD CONSTRAINT "production_material_consumptions_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "public"."inventory_movements"("id");



ALTER TABLE ONLY "public"."production_material_consumptions"
    ADD CONSTRAINT "production_material_consumptions_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "public"."profil"("id");



ALTER TABLE ONLY "public"."production_material_consumptions"
    ADD CONSTRAINT "production_material_consumptions_roll_variant_id_fkey" FOREIGN KEY ("roll_variant_id") REFERENCES "public"."barang_roll_variants"("id");



ALTER TABLE ONLY "public"."production_material_consumptions"
    ADD CONSTRAINT "production_material_consumptions_waste_movement_id_fkey" FOREIGN KEY ("waste_movement_id") REFERENCES "public"."inventory_movements"("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_barang_id_fkey" FOREIGN KEY ("barang_id") REFERENCES "public"."barang"("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_harga_satuan_id_fkey" FOREIGN KEY ("harga_satuan_id") REFERENCES "public"."harga_barang_satuan"("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_dibuat_oleh_fkey" FOREIGN KEY ("dibuat_oleh") REFERENCES "public"."profil"("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id");



ALTER TABLE ONLY "public"."retur_pembelian"
    ADD CONSTRAINT "retur_pembelian_dibuat_oleh_fkey" FOREIGN KEY ("dibuat_oleh") REFERENCES "public"."profil"("id");



ALTER TABLE ONLY "public"."retur_pembelian"
    ADD CONSTRAINT "retur_pembelian_pembelian_id_fkey" FOREIGN KEY ("pembelian_id") REFERENCES "public"."pembelian"("id");



ALTER TABLE ONLY "public"."retur_penjualan"
    ADD CONSTRAINT "retur_penjualan_dibuat_oleh_fkey" FOREIGN KEY ("dibuat_oleh") REFERENCES "public"."profil"("id");



ALTER TABLE ONLY "public"."retur_penjualan"
    ADD CONSTRAINT "retur_penjualan_penjualan_id_fkey" FOREIGN KEY ("penjualan_id") REFERENCES "public"."penjualan"("id");



ALTER TABLE ONLY "public"."rumus_buku_kas"
    ADD CONSTRAINT "rumus_buku_kas_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."pegawai"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."slip_gaji"
    ADD CONSTRAINT "slip_gaji_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."pegawai"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."slip_gaji"
    ADD CONSTRAINT "slip_gaji_proses_gaji_id_fkey" FOREIGN KEY ("proses_gaji_id") REFERENCES "public"."proses_gaji"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spesifikasi_cepat_barang"
    ADD CONSTRAINT "spesifikasi_cepat_barang_kategori_id_fkey" FOREIGN KEY ("kategori_id") REFERENCES "public"."kategori_barang"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_opname_items"
    ADD CONSTRAINT "stock_opname_items_barang_id_fkey" FOREIGN KEY ("barang_id") REFERENCES "public"."barang"("id");



ALTER TABLE ONLY "public"."stock_opname_items"
    ADD CONSTRAINT "stock_opname_items_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "public"."inventory_movements"("id");



ALTER TABLE ONLY "public"."stock_opname_items"
    ADD CONSTRAINT "stock_opname_items_stock_opname_id_fkey" FOREIGN KEY ("stock_opname_id") REFERENCES "public"."stock_opnames"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_opnames"
    ADD CONSTRAINT "stock_opnames_dibuat_oleh_fkey" FOREIGN KEY ("dibuat_oleh") REFERENCES "public"."profil"("id");



ALTER TABLE ONLY "public"."stock_opnames"
    ADD CONSTRAINT "stock_opnames_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "public"."profil"("id");



ALTER TABLE ONLY "public"."subkategori_barang"
    ADD CONSTRAINT "subkategori_barang_kategori_id_fkey" FOREIGN KEY ("kategori_id") REFERENCES "public"."kategori_barang"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."surat_jalan"
    ADD CONSTRAINT "surat_jalan_dibuat_oleh_fkey" FOREIGN KEY ("dibuat_oleh") REFERENCES "public"."profil"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."surat_jalan"
    ADD CONSTRAINT "surat_jalan_penjualan_id_fkey" FOREIGN KEY ("penjualan_id") REFERENCES "public"."penjualan"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transaksi_penggantian"
    ADD CONSTRAINT "transaksi_penggantian_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."keuangan"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaksi_terhitung"
    ADD CONSTRAINT "transaksi_terhitung_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."keuangan"("id") ON DELETE CASCADE;



CREATE POLICY "Anon read" ON "public"."biaya_tambahan_penjualan" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Anon read" ON "public"."item_surat_jalan" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Anon read" ON "public"."surat_jalan" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Service role full access" ON "public"."biaya_tambahan_penjualan" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."item_surat_jalan" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."komponen_kompensasi" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."pinjaman_karyawan" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."proses_gaji" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."slip_gaji" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."surat_jalan" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."accounting_periods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."accounting_posting_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "anon_full_access" ON "public"."accounting_periods" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."accounting_posting_rules" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."audit_log" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."barang" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."barang_roll_variants" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."chart_of_accounts" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."companies" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."device_registry" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."finance_category_definitions" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."finance_metric_mappings" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."fiscal_periods" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."harga_barang_satuan" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."hutang_pembelian" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."inventory_movements" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."item_finishing" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."item_pembelian" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."item_penawaran" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."item_penjualan" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."item_produksi" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."item_retur_pembelian" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."item_retur_penjualan" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."journal_entries" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."journal_entry_lines" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."kategori_barang" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."keuangan" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."komponen_kompensasi" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."kredensial" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."lokasi" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."nsfp_pool" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."opsi_finishing" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."order_produksi" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."pegawai" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."pelanggan" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."pelunasan_hutang" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."pelunasan_piutang" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."pembelian" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."penawaran" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."pengaturan_toko" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."penjualan" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."peran_pegawai" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."pinjaman_karyawan" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."piutang_penjualan" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."production_material_consumptions" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."proses_gaji" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."purchase_order_items" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."purchase_orders" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."retur_pembelian" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."retur_penjualan" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."satuan_barang" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."slip_gaji" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."spesifikasi_cepat_barang" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."stock_opname_items" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."stock_opnames" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."subkategori_barang" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."sync_conflicts" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."sync_mutation_registry" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."transaksi_penggantian" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."transaksi_terhitung" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_full_access" ON "public"."vendor" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_login_read" ON "public"."profil" FOR SELECT TO "anon" USING (true);



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."barang" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."barang_roll_variants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."biaya_tambahan_penjualan" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chart_of_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."device_registry" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_category_definitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_metric_mappings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fiscal_periods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."harga_barang_satuan" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hutang_pembelian" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."item_finishing" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."item_pembelian" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."item_penawaran" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."item_penjualan" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."item_produksi" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."item_retur_pembelian" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."item_retur_penjualan" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."item_surat_jalan" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."journal_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."journal_entry_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kategori_barang" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."keuangan" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."komponen_kompensasi" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kredensial" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lokasi" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nsfp_pool" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."opsi_finishing" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_produksi" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pegawai" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pelanggan" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pelunasan_hutang" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pelunasan_piutang" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pembelian" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."penawaran" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pengaturan_toko" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."penjualan" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."peran_pegawai" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pinjaman_karyawan" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."piutang_penjualan" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."production_material_consumptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profil" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proses_gaji" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."retur_pembelian" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."retur_penjualan" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."satuan_barang" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."slip_gaji" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."spesifikasi_cepat_barang" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_opname_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_opnames" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subkategori_barang" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."surat_jalan" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sync_conflicts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sync_mutation_registry" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transaksi_penggantian" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transaksi_terhitung" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vendor" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."apply_inventory_adjustment"("p_id" "text", "p_barang_id" "text", "p_qty_delta" real, "p_reason" "text", "p_unit_cost" real, "p_tanggal" "date", "p_actor_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_inventory_adjustment"("p_id" "text", "p_barang_id" "text", "p_qty_delta" real, "p_reason" "text", "p_unit_cost" real, "p_tanggal" "date", "p_actor_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_inventory_adjustment"("p_id" "text", "p_barang_id" "text", "p_qty_delta" real, "p_reason" "text", "p_unit_cost" real, "p_tanggal" "date", "p_actor_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_inventory_adjustment"("p_id" "text", "p_barang_id" "text", "p_qty_delta" real, "p_reason" "text", "p_unit_cost" real, "p_tanggal" "date", "p_actor_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_inventory_waste"("p_id" "text", "p_barang_id" "text", "p_qty" real, "p_reason" "text", "p_tanggal" "date", "p_actor_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_inventory_waste"("p_id" "text", "p_barang_id" "text", "p_qty" real, "p_reason" "text", "p_tanggal" "date", "p_actor_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_inventory_waste"("p_id" "text", "p_barang_id" "text", "p_qty" real, "p_reason" "text", "p_tanggal" "date", "p_actor_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_inventory_waste"("p_id" "text", "p_barang_id" "text", "p_qty" real, "p_reason" "text", "p_tanggal" "date", "p_actor_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_purchase_return"("p_purchase_id" "text", "p_reason" "text", "p_actor_id" "text", "p_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_purchase_return"("p_purchase_id" "text", "p_reason" "text", "p_actor_id" "text", "p_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_purchase_return"("p_purchase_id" "text", "p_reason" "text", "p_actor_id" "text", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_purchase_return"("p_purchase_id" "text", "p_reason" "text", "p_actor_id" "text", "p_items" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."assert_period_open"("p_tanggal" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assert_period_open"("p_tanggal" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."assert_period_open"("p_tanggal" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assert_period_open"("p_tanggal" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_purchase_with_inventory"("payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_purchase_with_inventory"("payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_purchase_with_inventory"("payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_purchase_with_inventory"("payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_sale_with_inventory"("payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_sale_with_inventory"("payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_sale_with_inventory"("payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_sale_with_inventory"("payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."hitung_ppn"("amount" real, "tarif" real, "metode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hitung_ppn"("amount" real, "tarif" real, "metode" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hitung_ppn"("amount" real, "tarif" real, "metode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hitung_ppn"("amount" real, "tarif" real, "metode" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."inventory_post_movement"("p_id" "text", "p_barang_id" "text", "p_tanggal" "text", "p_movement_type" "text", "p_qty_delta" real, "p_unit_cost" real, "p_source_type" "text", "p_source_id" "text", "p_source_line_id" "text", "p_reversal_of_id" "text", "p_catatan" "text", "p_dibuat_oleh" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_post_movement"("p_id" "text", "p_barang_id" "text", "p_tanggal" "text", "p_movement_type" "text", "p_qty_delta" real, "p_unit_cost" real, "p_source_type" "text", "p_source_id" "text", "p_source_line_id" "text", "p_reversal_of_id" "text", "p_catatan" "text", "p_dibuat_oleh" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."inventory_post_movement"("p_id" "text", "p_barang_id" "text", "p_tanggal" "text", "p_movement_type" "text", "p_qty_delta" real, "p_unit_cost" real, "p_source_type" "text", "p_source_id" "text", "p_source_line_id" "text", "p_reversal_of_id" "text", "p_catatan" "text", "p_dibuat_oleh" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_post_movement"("p_id" "text", "p_barang_id" "text", "p_tanggal" "text", "p_movement_type" "text", "p_qty_delta" real, "p_unit_cost" real, "p_source_type" "text", "p_source_id" "text", "p_source_line_id" "text", "p_reversal_of_id" "text", "p_catatan" "text", "p_dibuat_oleh" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_diperbarui_pada"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_diperbarui_pada"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_diperbarui_pada"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."void_purchase_with_inventory"("purchase_id" "text", "reason" "text", "actor_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."void_purchase_with_inventory"("purchase_id" "text", "reason" "text", "actor_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."void_purchase_with_inventory"("purchase_id" "text", "reason" "text", "actor_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."void_purchase_with_inventory"("purchase_id" "text", "reason" "text", "actor_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."void_sale_with_inventory"("sale_id" "text", "reason" "text", "actor_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."void_sale_with_inventory"("sale_id" "text", "reason" "text", "actor_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."void_sale_with_inventory"("sale_id" "text", "reason" "text", "actor_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."void_sale_with_inventory"("sale_id" "text", "reason" "text", "actor_id" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."accounting_periods" TO "anon";
GRANT ALL ON TABLE "public"."accounting_periods" TO "authenticated";
GRANT ALL ON TABLE "public"."accounting_periods" TO "service_role";



GRANT ALL ON TABLE "public"."accounting_posting_rules" TO "anon";
GRANT ALL ON TABLE "public"."accounting_posting_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."accounting_posting_rules" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."barang" TO "anon";
GRANT ALL ON TABLE "public"."barang" TO "authenticated";
GRANT ALL ON TABLE "public"."barang" TO "service_role";



GRANT ALL ON TABLE "public"."barang_roll_variants" TO "anon";
GRANT ALL ON TABLE "public"."barang_roll_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."barang_roll_variants" TO "service_role";



GRANT ALL ON TABLE "public"."biaya_tambahan_penjualan" TO "anon";
GRANT ALL ON TABLE "public"."biaya_tambahan_penjualan" TO "authenticated";
GRANT ALL ON TABLE "public"."biaya_tambahan_penjualan" TO "service_role";



GRANT ALL ON TABLE "public"."chart_of_accounts" TO "anon";
GRANT ALL ON TABLE "public"."chart_of_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."chart_of_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."companies" TO "anon";
GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT ALL ON TABLE "public"."companies" TO "service_role";



GRANT ALL ON TABLE "public"."device_registry" TO "anon";
GRANT ALL ON TABLE "public"."device_registry" TO "authenticated";
GRANT ALL ON TABLE "public"."device_registry" TO "service_role";



GRANT ALL ON TABLE "public"."finance_category_definitions" TO "anon";
GRANT ALL ON TABLE "public"."finance_category_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_category_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."finance_metric_column_rules" TO "anon";
GRANT ALL ON TABLE "public"."finance_metric_column_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_metric_column_rules" TO "service_role";



GRANT ALL ON TABLE "public"."finance_metric_mappings" TO "anon";
GRANT ALL ON TABLE "public"."finance_metric_mappings" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_metric_mappings" TO "service_role";



GRANT ALL ON TABLE "public"."fiscal_periods" TO "anon";
GRANT ALL ON TABLE "public"."fiscal_periods" TO "authenticated";
GRANT ALL ON TABLE "public"."fiscal_periods" TO "service_role";



GRANT ALL ON TABLE "public"."harga_barang_satuan" TO "anon";
GRANT ALL ON TABLE "public"."harga_barang_satuan" TO "authenticated";
GRANT ALL ON TABLE "public"."harga_barang_satuan" TO "service_role";



GRANT ALL ON TABLE "public"."hutang_pembelian" TO "anon";
GRANT ALL ON TABLE "public"."hutang_pembelian" TO "authenticated";
GRANT ALL ON TABLE "public"."hutang_pembelian" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_movements" TO "anon";
GRANT ALL ON TABLE "public"."inventory_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_movements" TO "service_role";



GRANT ALL ON TABLE "public"."item_finishing" TO "anon";
GRANT ALL ON TABLE "public"."item_finishing" TO "authenticated";
GRANT ALL ON TABLE "public"."item_finishing" TO "service_role";



GRANT ALL ON TABLE "public"."item_pembelian" TO "anon";
GRANT ALL ON TABLE "public"."item_pembelian" TO "authenticated";
GRANT ALL ON TABLE "public"."item_pembelian" TO "service_role";



GRANT ALL ON TABLE "public"."item_penawaran" TO "anon";
GRANT ALL ON TABLE "public"."item_penawaran" TO "authenticated";
GRANT ALL ON TABLE "public"."item_penawaran" TO "service_role";



GRANT ALL ON TABLE "public"."item_penjualan" TO "anon";
GRANT ALL ON TABLE "public"."item_penjualan" TO "authenticated";
GRANT ALL ON TABLE "public"."item_penjualan" TO "service_role";



GRANT ALL ON TABLE "public"."item_produksi" TO "anon";
GRANT ALL ON TABLE "public"."item_produksi" TO "authenticated";
GRANT ALL ON TABLE "public"."item_produksi" TO "service_role";



GRANT ALL ON TABLE "public"."item_retur_pembelian" TO "anon";
GRANT ALL ON TABLE "public"."item_retur_pembelian" TO "authenticated";
GRANT ALL ON TABLE "public"."item_retur_pembelian" TO "service_role";



GRANT ALL ON TABLE "public"."item_retur_penjualan" TO "anon";
GRANT ALL ON TABLE "public"."item_retur_penjualan" TO "authenticated";
GRANT ALL ON TABLE "public"."item_retur_penjualan" TO "service_role";



GRANT ALL ON TABLE "public"."item_surat_jalan" TO "anon";
GRANT ALL ON TABLE "public"."item_surat_jalan" TO "authenticated";
GRANT ALL ON TABLE "public"."item_surat_jalan" TO "service_role";



GRANT ALL ON TABLE "public"."journal_entries" TO "anon";
GRANT ALL ON TABLE "public"."journal_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."journal_entries" TO "service_role";



GRANT ALL ON TABLE "public"."journal_entry_lines" TO "anon";
GRANT ALL ON TABLE "public"."journal_entry_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."journal_entry_lines" TO "service_role";



GRANT ALL ON TABLE "public"."kategori_barang" TO "anon";
GRANT ALL ON TABLE "public"."kategori_barang" TO "authenticated";
GRANT ALL ON TABLE "public"."kategori_barang" TO "service_role";



GRANT ALL ON TABLE "public"."keuangan" TO "anon";
GRANT ALL ON TABLE "public"."keuangan" TO "authenticated";
GRANT ALL ON TABLE "public"."keuangan" TO "service_role";



GRANT ALL ON TABLE "public"."komponen_kompensasi" TO "anon";
GRANT ALL ON TABLE "public"."komponen_kompensasi" TO "authenticated";
GRANT ALL ON TABLE "public"."komponen_kompensasi" TO "service_role";



GRANT ALL ON TABLE "public"."kredensial" TO "anon";
GRANT ALL ON TABLE "public"."kredensial" TO "authenticated";
GRANT ALL ON TABLE "public"."kredensial" TO "service_role";



GRANT ALL ON TABLE "public"."lokasi" TO "anon";
GRANT ALL ON TABLE "public"."lokasi" TO "authenticated";
GRANT ALL ON TABLE "public"."lokasi" TO "service_role";



GRANT ALL ON TABLE "public"."nsfp_pool" TO "anon";
GRANT ALL ON TABLE "public"."nsfp_pool" TO "authenticated";
GRANT ALL ON TABLE "public"."nsfp_pool" TO "service_role";



GRANT ALL ON TABLE "public"."opsi_finishing" TO "anon";
GRANT ALL ON TABLE "public"."opsi_finishing" TO "authenticated";
GRANT ALL ON TABLE "public"."opsi_finishing" TO "service_role";



GRANT ALL ON TABLE "public"."order_produksi" TO "anon";
GRANT ALL ON TABLE "public"."order_produksi" TO "authenticated";
GRANT ALL ON TABLE "public"."order_produksi" TO "service_role";



GRANT ALL ON TABLE "public"."pegawai" TO "anon";
GRANT ALL ON TABLE "public"."pegawai" TO "authenticated";
GRANT ALL ON TABLE "public"."pegawai" TO "service_role";



GRANT ALL ON TABLE "public"."pelanggan" TO "anon";
GRANT ALL ON TABLE "public"."pelanggan" TO "authenticated";
GRANT ALL ON TABLE "public"."pelanggan" TO "service_role";



GRANT ALL ON TABLE "public"."pelunasan_hutang" TO "anon";
GRANT ALL ON TABLE "public"."pelunasan_hutang" TO "authenticated";
GRANT ALL ON TABLE "public"."pelunasan_hutang" TO "service_role";



GRANT ALL ON TABLE "public"."pelunasan_piutang" TO "anon";
GRANT ALL ON TABLE "public"."pelunasan_piutang" TO "authenticated";
GRANT ALL ON TABLE "public"."pelunasan_piutang" TO "service_role";



GRANT ALL ON TABLE "public"."pembelian" TO "anon";
GRANT ALL ON TABLE "public"."pembelian" TO "authenticated";
GRANT ALL ON TABLE "public"."pembelian" TO "service_role";



GRANT ALL ON TABLE "public"."penawaran" TO "anon";
GRANT ALL ON TABLE "public"."penawaran" TO "authenticated";
GRANT ALL ON TABLE "public"."penawaran" TO "service_role";



GRANT ALL ON TABLE "public"."pengaturan_toko" TO "anon";
GRANT ALL ON TABLE "public"."pengaturan_toko" TO "authenticated";
GRANT ALL ON TABLE "public"."pengaturan_toko" TO "service_role";



GRANT ALL ON TABLE "public"."penjualan" TO "anon";
GRANT ALL ON TABLE "public"."penjualan" TO "authenticated";
GRANT ALL ON TABLE "public"."penjualan" TO "service_role";



GRANT ALL ON TABLE "public"."peran_pegawai" TO "anon";
GRANT ALL ON TABLE "public"."peran_pegawai" TO "authenticated";
GRANT ALL ON TABLE "public"."peran_pegawai" TO "service_role";



GRANT ALL ON TABLE "public"."pinjaman_karyawan" TO "anon";
GRANT ALL ON TABLE "public"."pinjaman_karyawan" TO "authenticated";
GRANT ALL ON TABLE "public"."pinjaman_karyawan" TO "service_role";



GRANT ALL ON TABLE "public"."piutang_penjualan" TO "anon";
GRANT ALL ON TABLE "public"."piutang_penjualan" TO "authenticated";
GRANT ALL ON TABLE "public"."piutang_penjualan" TO "service_role";



GRANT ALL ON TABLE "public"."production_material_consumptions" TO "anon";
GRANT ALL ON TABLE "public"."production_material_consumptions" TO "authenticated";
GRANT ALL ON TABLE "public"."production_material_consumptions" TO "service_role";



GRANT ALL ON TABLE "public"."profil" TO "anon";
GRANT ALL ON TABLE "public"."profil" TO "authenticated";
GRANT ALL ON TABLE "public"."profil" TO "service_role";



GRANT ALL ON TABLE "public"."proses_gaji" TO "anon";
GRANT ALL ON TABLE "public"."proses_gaji" TO "authenticated";
GRANT ALL ON TABLE "public"."proses_gaji" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_order_items" TO "anon";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_orders" TO "anon";
GRANT ALL ON TABLE "public"."purchase_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_orders" TO "service_role";



GRANT ALL ON TABLE "public"."retur_pembelian" TO "anon";
GRANT ALL ON TABLE "public"."retur_pembelian" TO "authenticated";
GRANT ALL ON TABLE "public"."retur_pembelian" TO "service_role";



GRANT ALL ON TABLE "public"."retur_penjualan" TO "anon";
GRANT ALL ON TABLE "public"."retur_penjualan" TO "authenticated";
GRANT ALL ON TABLE "public"."retur_penjualan" TO "service_role";



GRANT ALL ON TABLE "public"."rumus_buku_kas" TO "anon";
GRANT ALL ON TABLE "public"."rumus_buku_kas" TO "authenticated";
GRANT ALL ON TABLE "public"."rumus_buku_kas" TO "service_role";



GRANT ALL ON TABLE "public"."satuan_barang" TO "anon";
GRANT ALL ON TABLE "public"."satuan_barang" TO "authenticated";
GRANT ALL ON TABLE "public"."satuan_barang" TO "service_role";



GRANT ALL ON TABLE "public"."slip_gaji" TO "anon";
GRANT ALL ON TABLE "public"."slip_gaji" TO "authenticated";
GRANT ALL ON TABLE "public"."slip_gaji" TO "service_role";



GRANT ALL ON TABLE "public"."spesifikasi_cepat_barang" TO "anon";
GRANT ALL ON TABLE "public"."spesifikasi_cepat_barang" TO "authenticated";
GRANT ALL ON TABLE "public"."spesifikasi_cepat_barang" TO "service_role";



GRANT ALL ON TABLE "public"."stock_opname_items" TO "anon";
GRANT ALL ON TABLE "public"."stock_opname_items" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_opname_items" TO "service_role";



GRANT ALL ON TABLE "public"."stock_opnames" TO "anon";
GRANT ALL ON TABLE "public"."stock_opnames" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_opnames" TO "service_role";



GRANT ALL ON TABLE "public"."subkategori_barang" TO "anon";
GRANT ALL ON TABLE "public"."subkategori_barang" TO "authenticated";
GRANT ALL ON TABLE "public"."subkategori_barang" TO "service_role";



GRANT ALL ON TABLE "public"."surat_jalan" TO "anon";
GRANT ALL ON TABLE "public"."surat_jalan" TO "authenticated";
GRANT ALL ON TABLE "public"."surat_jalan" TO "service_role";



GRANT ALL ON TABLE "public"."sync_conflicts" TO "anon";
GRANT ALL ON TABLE "public"."sync_conflicts" TO "authenticated";
GRANT ALL ON TABLE "public"."sync_conflicts" TO "service_role";



GRANT ALL ON TABLE "public"."sync_mutation_registry" TO "anon";
GRANT ALL ON TABLE "public"."sync_mutation_registry" TO "authenticated";
GRANT ALL ON TABLE "public"."sync_mutation_registry" TO "service_role";



GRANT ALL ON TABLE "public"."transaksi_penggantian" TO "anon";
GRANT ALL ON TABLE "public"."transaksi_penggantian" TO "authenticated";
GRANT ALL ON TABLE "public"."transaksi_penggantian" TO "service_role";



GRANT ALL ON TABLE "public"."transaksi_terhitung" TO "anon";
GRANT ALL ON TABLE "public"."transaksi_terhitung" TO "authenticated";
GRANT ALL ON TABLE "public"."transaksi_terhitung" TO "service_role";



GRANT ALL ON TABLE "public"."v_ppn_keluaran" TO "anon";
GRANT ALL ON TABLE "public"."v_ppn_keluaran" TO "authenticated";
GRANT ALL ON TABLE "public"."v_ppn_keluaran" TO "service_role";



GRANT ALL ON TABLE "public"."vendor" TO "anon";
GRANT ALL ON TABLE "public"."vendor" TO "authenticated";
GRANT ALL ON TABLE "public"."vendor" TO "service_role";



GRANT ALL ON TABLE "public"."v_ppn_masukan" TO "anon";
GRANT ALL ON TABLE "public"."v_ppn_masukan" TO "authenticated";
GRANT ALL ON TABLE "public"."v_ppn_masukan" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
