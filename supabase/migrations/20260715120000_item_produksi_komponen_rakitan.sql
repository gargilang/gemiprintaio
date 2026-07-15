-- Baris item_produksi anak untuk komponen rakitan berdimensi.
-- parent_item_produksi_id != NULL menandai baris ini adalah komponen (barang_id
-- = komponen berdimensi) dari item produksi induk. NULL = baris normal/induk.
ALTER TABLE item_produksi
  ADD COLUMN IF NOT EXISTS parent_item_produksi_id TEXT
  REFERENCES item_produksi(id) ON DELETE CASCADE;
