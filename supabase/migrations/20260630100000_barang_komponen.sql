-- Tabel komponen rakitan (Bill of Materials sederhana)
-- Satu baris = satu komponen yang berkurang saat barang induk selesai diproduksi.
CREATE TABLE IF NOT EXISTS barang_komponen (
  id                 TEXT PRIMARY KEY,
  parent_barang_id   TEXT NOT NULL REFERENCES barang(id) ON DELETE CASCADE,
  komponen_id        TEXT NOT NULL REFERENCES barang(id),
  qty                NUMERIC(10,4) NOT NULL DEFAULT 1 CHECK (qty > 0),
  satuan             TEXT,
  catatan            TEXT,
  dibuat_oleh        TEXT,
  dibuat_pada        TIMESTAMPTZ NOT NULL DEFAULT now(),
  diperbarui_pada    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Kolom sync standar
  sync_status        TEXT NOT NULL DEFAULT 'pending',
  last_synced_at     TIMESTAMPTZ,
  sync_version       INTEGER NOT NULL DEFAULT 0,
  updated_at_server  TIMESTAMPTZ,
  updated_by_device  TEXT,
  change_version     INTEGER NOT NULL DEFAULT 0,
  is_deleted         INTEGER NOT NULL DEFAULT 0,
  deleted_at         TIMESTAMPTZ,
  client_mutation_id TEXT,
  CONSTRAINT bk_no_self_ref CHECK (parent_barang_id <> komponen_id)
);

CREATE INDEX IF NOT EXISTS idx_barang_komponen_parent ON barang_komponen(parent_barang_id);
CREATE INDEX IF NOT EXISTS idx_barang_komponen_komponen ON barang_komponen(komponen_id);
CREATE INDEX IF NOT EXISTS idx_barang_komponen_sync ON barang_komponen(sync_status);
CREATE INDEX IF NOT EXISTS idx_barang_komponen_deleted ON barang_komponen(is_deleted);
