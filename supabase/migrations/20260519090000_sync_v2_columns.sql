-- Sync V2 columns for all tracked tables
-- These columns are added to SQLite by db-unified.ts (ensureServerSQLiteSyncV2Schema)
-- but were never added to Supabase, causing PGRST204 errors when inserting.
--
-- All statements use ADD COLUMN IF NOT EXISTS so this migration is safe to
-- re-run and safe on tables that already have the column.

DO $$ DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'kategori_barang', 'subkategori_barang', 'satuan_barang',
    'spesifikasi_cepat_barang', 'barang', 'harga_barang_satuan',
    'opsi_finishing', 'pelanggan', 'vendor', 'profil', 'kredensial',
    'penjualan', 'item_penjualan', 'pembelian', 'item_pembelian',
    'piutang_penjualan', 'pelunasan_piutang', 'hutang_pembelian',
    'pelunasan_hutang', 'order_produksi', 'item_produksi', 'item_finishing',
    'keuangan', 'finance_category_definitions',
    'finance_participants', 'finance_metric_mappings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Only proceed if the table actually exists
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at_server TIMESTAMPTZ', t
      );
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_by_device TEXT DEFAULT ''server''', t
      );
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN IF NOT EXISTS change_version INTEGER DEFAULT 1', t
      );
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN IF NOT EXISTS is_deleted INTEGER NOT NULL DEFAULT 0', t
      );
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', t
      );
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN IF NOT EXISTS client_mutation_id TEXT', t
      );
    END IF;
  END LOOP;
END $$;
