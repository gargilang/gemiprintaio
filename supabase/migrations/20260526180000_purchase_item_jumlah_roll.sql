-- Tambah field jumlah_roll di item_pembelian agar 1 baris pembelian dapat
-- mewakili N roll dengan dimensi yang sama. Sebelumnya, untuk membeli 5
-- roll 3m × 70m admin harus menambah 5 baris identik. Dengan field ini,
-- cukup isi qty=5, lebar=3, panjang=70 dan sistem akan mengkalkulasi
-- linear_delta_m = qty × panjang dan total area = qty × panjang × lebar.
--
-- Default 1 supaya semua pembelian existing tetap valid (1 roll per baris).

ALTER TABLE item_pembelian
  ADD COLUMN IF NOT EXISTS jumlah_roll INTEGER NOT NULL DEFAULT 1
  CHECK(jumlah_roll >= 1);
