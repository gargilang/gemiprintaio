-- ════════════════════════════════════════════════════════════════════════════
-- Migration: maklon_support
-- Goal: support outbound subcontract printing ("maklon") — when we accept a
--       customer order but contract a partner print shop to actually produce
--       part or all of it. Each subcontracted line on a sale auto-creates a
--       linked vendor purchase, so the customer side stays a normal POS
--       transaction (with invoice + faktur) while the vendor side becomes a
--       proper PO with optional NET30 hutang.
--
-- Pattern (matches SAP/Odoo subcontract manufacturing):
--   penjualan ──┬─► item_penjualan (tipe_item='MAKLON', vendor_subkontrak_id, biaya_subkontrak)
--               │     │
--               │     └─► pembelian (tipe_pembelian='MAKLON', penjualan_id_sumber=<saleId>)
--               │           ├─► item_pembelian (placeholder barang "Jasa Maklon Cetak")
--               │           ├─► keuangan (kategori_transaksi='MAKLON', kredit=biaya)  [CASH]
--               │           └─► hutang_pembelian                                       [NET30]
--               │
--               └─► keuangan OMZET / HPP (HPP includes biaya_subkontrak per line)
--
-- Effect on cashbook:
--   - OMZET (full sale total) hits saldo + omzet (cash in from customer).
--   - HPP (includes per-line biaya_subkontrak as the maklon line's HPP) hits
--     biaya_bahan but is excluded from saldo (non-cash journal entry).
--   - MAKLON kredit (CASH or hutang payoff) hits saldo only — the cost was
--     already captured via HPP, so we don't double-count by also adding to
--     biaya_operasional / biaya_bahan. Same shape as SUPPLY.
--
-- Tables touched: item_penjualan, pembelian, vendor, finance_category_definitions.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Sale line item: maklon metadata.
ALTER TABLE item_penjualan
  ADD COLUMN IF NOT EXISTS tipe_item TEXT NOT NULL DEFAULT 'BARANG'
    CHECK (tipe_item IN ('BARANG', 'JASA', 'MAKLON'));

ALTER TABLE item_penjualan
  ADD COLUMN IF NOT EXISTS vendor_subkontrak_id TEXT
    REFERENCES vendor(id) ON DELETE SET NULL;

ALTER TABLE item_penjualan
  ADD COLUMN IF NOT EXISTS biaya_subkontrak REAL;

ALTER TABLE item_penjualan
  ADD COLUMN IF NOT EXISTS metode_bayar_vendor TEXT
    CHECK (metode_bayar_vendor IS NULL OR metode_bayar_vendor IN ('CASH', 'NET30'));

ALTER TABLE item_penjualan
  ADD COLUMN IF NOT EXISTS pembelian_id_terkait TEXT
    REFERENCES pembelian(id) ON DELETE SET NULL;

ALTER TABLE item_penjualan
  ADD COLUMN IF NOT EXISTS deskripsi_pekerjaan TEXT;

CREATE INDEX IF NOT EXISTS idx_item_penjualan_tipe_item
  ON item_penjualan(tipe_item);
CREATE INDEX IF NOT EXISTS idx_item_penjualan_pembelian_terkait
  ON item_penjualan(pembelian_id_terkait);

-- 2. Purchase header: type + back-link to sale that triggered it.
ALTER TABLE pembelian
  ADD COLUMN IF NOT EXISTS tipe_pembelian TEXT NOT NULL DEFAULT 'BARANG'
    CHECK (tipe_pembelian IN ('BARANG', 'MAKLON'));

ALTER TABLE pembelian
  ADD COLUMN IF NOT EXISTS penjualan_id_sumber TEXT
    REFERENCES penjualan(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pembelian_penjualan_sumber
  ON pembelian(penjualan_id_sumber);
CREATE INDEX IF NOT EXISTS idx_pembelian_tipe
  ON pembelian(tipe_pembelian);

-- 3. Vendor classification: same vendor table holds both supplier-of-materials
--    and subcontractor-print-shops. POS subcontract picker filters for
--    SUBKONTRAKTOR / KEDUANYA only; existing rows default to SUPPLIER.
ALTER TABLE vendor
  ADD COLUMN IF NOT EXISTS tipe_vendor TEXT NOT NULL DEFAULT 'SUPPLIER'
    CHECK (tipe_vendor IN ('SUPPLIER', 'SUBKONTRAKTOR', 'KEDUANYA'));

CREATE INDEX IF NOT EXISTS idx_vendor_tipe
  ON vendor(tipe_vendor);

-- 4. New finance category for maklon outflows (separate from SUPPLY so a user
--    can filter "biaya maklon bulan ini" cleanly in the cashbook).
INSERT INTO finance_category_definitions
  (id, category_code, display_name, color_bg, color_text, color_border, direction, display_order, is_active)
VALUES (
  'fin-cat-maklon',
  'MAKLON',
  'Maklon',
  'bg-fuchsia-100',
  'text-fuchsia-800',
  'border-fuchsia-300',
  'kredit',
  75,
  1
)
ON CONFLICT (category_code) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  color_bg = EXCLUDED.color_bg,
  color_text = EXCLUDED.color_text,
  color_border = EXCLUDED.color_border,
  direction = EXCLUDED.direction,
  is_active = 1;

-- 5. Seed placeholder barang "Jasa Maklon Cetak" used as the FK target for
--    every MAKLON line on item_penjualan and item_pembelian. Inventory
--    tracking is OFF so stock never moves; the real cost is captured
--    per-line via biaya_subkontrak / item_pembelian.harga_satuan.
INSERT INTO barang
  (id, nama, deskripsi, kategori_id, satuan_dasar, jumlah_stok, average_cost_per_base_unit,
   level_stok_minimum, lacak_inventori_status, butuh_dimensi_status)
VALUES (
  'barang-jasa-maklon',
  'Jasa Maklon Cetak',
  'Placeholder untuk pekerjaan yang dikerjakan vendor subkontraktor (auto-generated, jangan diedit).',
  'cat-lain-lain',
  'pcs',
  0, 0, 0, 0, 0
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO harga_barang_satuan
  (id, barang_id, nama_satuan, faktor_konversi, harga_beli, harga_jual, harga_member, default_status, urutan_tampilan)
VALUES (
  'harga-jasa-maklon-pcs',
  'barang-jasa-maklon',
  'pcs',
  1, 0, 0, 0, 1, 0
)
ON CONFLICT (id) DO NOTHING;
