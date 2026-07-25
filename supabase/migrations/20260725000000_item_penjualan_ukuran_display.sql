-- Tambah kolom ukuran_display untuk item sekali pakai
-- String ukuran bebas (mis. "A3", "1m x 3m") untuk tampilan kolom UKURAN di faktur.
-- Tidak dipakai untuk kalkulasi apapun.
ALTER TABLE item_penjualan ADD COLUMN IF NOT EXISTS ukuran_display TEXT;
