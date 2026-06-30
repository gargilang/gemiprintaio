ALTER TABLE item_penawaran ADD COLUMN IF NOT EXISTS jumlah_lembar INTEGER;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS jumlah_roll INTEGER;
