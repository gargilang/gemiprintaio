-- Tambah kolom catatan_item ke item_penjualan.
-- Dipakai kasir untuk menulis label/keterangan kustom per baris pesanan
-- (mis. "Banner Pecel Lele") agar mudah diidentifikasi saat pengambilan barang.
-- Kolom ini dicetak di struk, faktur A5, dan SPK produksi.
ALTER TABLE item_penjualan ADD COLUMN IF NOT EXISTS catatan_item TEXT;
