-- Moving Weighted Average Cost + HPP snapshots

ALTER TABLE barang
  ADD COLUMN IF NOT EXISTS average_cost_per_base_unit REAL DEFAULT 0;

ALTER TABLE item_penjualan
  ADD COLUMN IF NOT EXISTS hpp_satuan REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hpp_total REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_profit REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_margin REAL DEFAULT 0;

UPDATE barang b
SET average_cost_per_base_unit = COALESCE(
  NULLIF(b.average_cost_per_base_unit, 0),
  COALESCE((
    SELECT h.harga_beli / NULLIF(h.faktor_konversi, 0)
    FROM harga_barang_satuan h
    WHERE h.barang_id = b.id
    ORDER BY h.default_status DESC, h.faktor_konversi ASC, h.urutan_tampilan ASC
    LIMIT 1
  ), 0)
);

INSERT INTO finance_category_definitions (
  id, category_code, display_name, color_bg, color_text, color_border,
  direction, is_active, display_order, metric_contributions
) VALUES (
  'fin-cat-hpp', 'HPP', 'Harga Pokok Penjualan',
  'bg-slate-100', 'text-slate-800', 'border-slate-300',
  'kredit', 1, 75,
  '[{"column":"biaya_bahan","amount_field":"kredit","sign":1}]'::jsonb
)
ON CONFLICT (category_code) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  metric_contributions = EXCLUDED.metric_contributions;

UPDATE finance_category_definitions
SET metric_contributions = NULL
WHERE category_code IN ('SUPPLY', 'HUTANG');

UPDATE cashbook_formula
SET
  ast = '{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"HPP"}},"then":{"type":"columnRef","column":"E"},"else":{"type":"literal","value":0}},"else":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"HPP"}},"then":{"type":"binaryOp","op":"+","left":{"type":"prevOutput","column":"I"},"right":{"type":"columnRef","column":"E"}},"else":{"type":"prevOutput","column":"I"}}}'::jsonb,
  description = 'Akumulasi HPP dari barang yang terjual.'
WHERE db_column = 'biaya_bahan';
