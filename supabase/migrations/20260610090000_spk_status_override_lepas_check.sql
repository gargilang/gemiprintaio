-- Otomasi status SPK: tandai override manual + lepas CHECK status produksi.
-- Status sekarang divalidasi di aplikasi (Zod) supaya menambah status baru
-- tidak perlu migrasi enum. Lihat src/lib/produksi/status-produksi.ts.

-- 1. Kolom penanda override manual pada order.
ALTER TABLE order_produksi
  ADD COLUMN IF NOT EXISTS status_override_manual boolean NOT NULL DEFAULT false;

-- 2. Lepas CHECK constraint status item & order (cari nama constraint runtime).
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname, rel.relname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE con.contype = 'c'
      AND rel.relname IN ('item_produksi', 'order_produksi')
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', c.relname, c.conname);
  END LOOP;
END $$;
