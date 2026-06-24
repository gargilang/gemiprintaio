-- Tabel laporan_bulanan: menyimpan riwayat laporan yang pernah digenerate
-- dan menjamin nomor laporan (LPR/YYYY/MM/XXX) bersifat sequential & unik.
CREATE TABLE IF NOT EXISTS "public"."laporan_bulanan" (
  "id"                  TEXT PRIMARY KEY,
  "nomor_laporan"       TEXT NOT NULL UNIQUE,
  "accounting_period_id" TEXT NOT NULL REFERENCES "public"."accounting_periods"("id"),
  "dibuat_oleh"         TEXT NOT NULL,
  "dibuat_pada"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "kata_pembuka"        TEXT,
  "kata_penutup"        TEXT,
  -- Kolom sync standar
  "sync_status"         TEXT NOT NULL DEFAULT 'pending'
                        CHECK (sync_status IN ('pending','synced','conflict')),
  "last_synced_at"      TIMESTAMPTZ,
  "sync_version"        INTEGER NOT NULL DEFAULT 0,
  "updated_at_server"   TIMESTAMPTZ,
  "updated_by_device"   TEXT,
  "change_version"      INTEGER NOT NULL DEFAULT 0,
  "is_deleted"          INTEGER NOT NULL DEFAULT 0,
  "deleted_at"          TIMESTAMPTZ,
  "client_mutation_id"  TEXT
);

CREATE INDEX IF NOT EXISTS "idx_laporan_bulanan_period"
  ON "public"."laporan_bulanan" ("accounting_period_id");
CREATE INDEX IF NOT EXISTS "idx_laporan_bulanan_sync"
  ON "public"."laporan_bulanan" ("sync_status");
