-- Sync Engine V2 baseline
-- Adds deterministic conflict metadata + audit tables.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  t text;
  sync_tables text[] := ARRAY[
    'kategori_barang',
    'subkategori_barang',
    'satuan_barang',
    'spesifikasi_cepat_barang',
    'barang',
    'harga_barang_satuan',
    'opsi_finishing',
    'pelanggan',
    'vendor',
    'profil',
    'kredensial',
    'penjualan',
    'item_penjualan',
    'pembelian',
    'item_pembelian',
    'piutang_penjualan',
    'pelunasan_piutang',
    'hutang_pembelian',
    'pelunasan_hutang',
    'order_produksi',
    'item_produksi',
    'item_finishing',
    'keuangan'
  ];
BEGIN
  FOREACH t IN ARRAY sync_tables LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at_server TIMESTAMPTZ DEFAULT NOW()',
      t
    );
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_by_device TEXT DEFAULT ''server''',
      t
    );
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS change_version BIGINT DEFAULT 1',
      t
    );
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE',
      t
    );
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
      t
    );
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS client_mutation_id TEXT',
      t
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I(updated_at_server)',
      'idx_' || t || '_updated_at_server',
      t
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I(change_version)',
      'idx_' || t || '_change_version',
      t
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I(is_deleted)',
      'idx_' || t || '_is_deleted',
      t
    );
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  conflict_type TEXT NOT NULL DEFAULT 'lww',
  winner_source TEXT NOT NULL,
  loser_source TEXT NOT NULL,
  winner_payload JSONB NOT NULL,
  loser_payload JSONB NOT NULL,
  winner_updated_at_server TIMESTAMPTZ,
  loser_updated_at_server TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_table_record
  ON sync_conflicts(table_name, record_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sync_mutation_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_mutation_id TEXT NOT NULL UNIQUE,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_mutation_registry_table_record
  ON sync_mutation_registry(table_name, record_id, processed_at DESC);

CREATE TABLE IF NOT EXISTS device_registry (
  device_id TEXT PRIMARY KEY,
  device_type TEXT NOT NULL CHECK(device_type IN ('web', 'tauri', 'server')),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB
);
