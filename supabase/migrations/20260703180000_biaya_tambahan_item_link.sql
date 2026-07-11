-- Tautkan biaya_tambahan_penjualan ke item_penjualan supaya cetak ulang
-- (reprint struk/faktur) bisa menampilkan biaya sebagai sub-baris per item,
-- selaras dengan cetak saat checkout. Additive & nullable: biaya lama yang
-- tidak punya tautan tetap valid (ditampilkan sebagai biaya header).
ALTER TABLE biaya_tambahan_penjualan
  ADD COLUMN IF NOT EXISTS item_penjualan_id TEXT
  REFERENCES item_penjualan(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_biaya_tambahan_penjualan_item
  ON biaya_tambahan_penjualan(item_penjualan_id);
