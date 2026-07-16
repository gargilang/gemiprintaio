-- Info nesting roll untuk barang berdimensi (berapa lembar berdampingan per
-- lebar roll + total panjang roll tersarankan). Dipakai untuk billing adil di
-- POS dan saran roll di SPK. Nullable → data lama fallback ke rumus lama.
ALTER TABLE item_penjualan ADD COLUMN IF NOT EXISTS roll_items_per_row REAL;
ALTER TABLE item_penjualan ADD COLUMN IF NOT EXISTS roll_rows REAL;
ALTER TABLE item_penjualan ADD COLUMN IF NOT EXISTS roll_panjang_total_m REAL;
