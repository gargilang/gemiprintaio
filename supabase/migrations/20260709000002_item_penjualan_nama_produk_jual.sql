-- Snapshot nama Produk Jual pada item penjualan agar struk/faktur/reprint
-- menampilkan produk yang dipilih, bukan nama barang dasar.

ALTER TABLE public.item_penjualan
  ADD COLUMN IF NOT EXISTS nama_produk_jual text;
