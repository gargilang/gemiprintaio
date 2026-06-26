-- Fungsi RPC untuk memperbarui banyak baris keuangan sekaligus (satu round-trip).
-- Menggantikan loop sequential di recalculateCashbookViaSupabase yang lambat
-- karena setiap UPDATE adalah round-trip terpisah ke Supabase.
--
-- Parameter: updates JSONB — array objek, masing-masing berisi "id" (UUID)
-- dan kolom yang perlu diperbarui. Kolom yang tidak ada di objek tidak ditimpa
-- (dijaga dengan COALESCE).
--
-- Contoh payload:
--   [{"id":"abc","saldo":1000000,"omzet":500000},{"id":"def","saldo":2000000}]

CREATE OR REPLACE FUNCTION bulk_update_keuangan(updates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec jsonb;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(updates) LOOP
    UPDATE keuangan
    SET
      saldo             = COALESCE((rec->>'saldo')::numeric,             saldo),
      omzet             = COALESCE((rec->>'omzet')::numeric,             omzet),
      biaya_operasional = COALESCE((rec->>'biaya_operasional')::numeric, biaya_operasional),
      biaya_bahan       = COALESCE((rec->>'biaya_bahan')::numeric,       biaya_bahan),
      laba_bersih       = COALESCE((rec->>'laba_bersih')::numeric,       laba_bersih)
    WHERE id = (rec->>'id')::uuid;
  END LOOP;
END;
$$;
