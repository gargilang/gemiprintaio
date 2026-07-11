-- Tambah kolom modal (biaya pihak ketiga) ke biaya tambahan penjualan.
-- Additive & idempoten. Default 0 = perilaku lama (murni omzet).
ALTER TABLE "public"."biaya_tambahan_penjualan"
  ADD COLUMN IF NOT EXISTS "modal" real NOT NULL DEFAULT 0;
