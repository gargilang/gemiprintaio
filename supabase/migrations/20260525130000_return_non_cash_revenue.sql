-- Retur Penjualan non-cash:
-- Kategori RETUR_PENJUALAN_NONCASH dipakai saat retur tidak menghasilkan
-- refund kas (mis. invoice belum dibayar; pengurangan langsung ke piutang).
-- Tujuannya: laporan omzet tetap turun penuh sesuai nilai retur,
-- tetapi saldo kas tidak ikut berkurang karena tidak ada cash outflow.
--
-- Implementasi:
--   1) Insert kategori finance baru `RETUR_PENJUALAN_NONCASH` (kredit, omzet -1).
--   2) Update AST kolom omzet (G) supaya RETUR_PENJUALAN_NONCASH ikut
--      dianggap pembalik omzet (sama seperti RETUR_PENJUALAN).
--   3) Update AST kolom saldo (J) supaya RETUR_PENJUALAN_NONCASH di-skip
--      seperti HPP / RETUR_HPP — tidak menyentuh kas berjalan.

INSERT INTO finance_category_definitions (
  id, category_code, display_name, color_bg, color_text, color_border,
  direction, is_active, display_order, metric_contributions
) VALUES (
  'fin-cat-retur-penjualan-noncash',
  'RETUR_PENJUALAN_NONCASH',
  'Retur Penjualan (non-kas)',
  'bg-rose-50',
  'text-rose-700',
  'border-rose-200',
  'kredit',
  1,
  33,
  '[{"column":"omzet","amount_field":"kredit","sign":-1}]'::jsonb
)
ON CONFLICT (category_code) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  color_bg = EXCLUDED.color_bg,
  color_text = EXCLUDED.color_text,
  color_border = EXCLUDED.color_border,
  direction = EXCLUDED.direction,
  is_active = 1,
  display_order = EXCLUDED.display_order,
  metric_contributions = EXCLUDED.metric_contributions,
  updated_at = NOW();

-- Omzet: trigger mencakup RETUR_PENJUALAN dan RETUR_PENJUALAN_NONCASH.
UPDATE cashbook_formula
SET ast = '{"type":"if","cond":{"type":"or","left":{"type":"or","left":{"type":"or","left":{"type":"not","arg":{"type":"iserror","arg":{"type":"search","find":{"type":"literal","value":"OMZET"},"within":{"type":"columnRef","column":"C"}}}},"right":{"type":"not","arg":{"type":"iserror","arg":{"type":"search","find":{"type":"literal","value":"PIUTANG"},"within":{"type":"columnRef","column":"C"}}}}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_PENJUALAN"}}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_PENJUALAN_NONCASH"}}},"then":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"if","cond":{"type":"or","left":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_PENJUALAN"}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_PENJUALAN_NONCASH"}}},"then":{"type":"binaryOp","op":"-","left":{"type":"literal","value":0},"right":{"type":"columnRef","column":"E"}},"else":{"type":"columnRef","column":"D"}},"else":{"type":"if","cond":{"type":"or","left":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_PENJUALAN"}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_PENJUALAN_NONCASH"}}},"then":{"type":"binaryOp","op":"-","left":{"type":"prevOutput","column":"G"},"right":{"type":"columnRef","column":"E"}},"else":{"type":"binaryOp","op":"+","left":{"type":"prevOutput","column":"G"},"right":{"type":"columnRef","column":"D"}}}},"else":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"literal","value":0},"else":{"type":"prevOutput","column":"G"}}}'::jsonb,
    description = 'Akumulasi penjualan + piutang dikurangi retur penjualan kas dan non-kas.'
WHERE column_key = 'G' OR db_column = 'omzet' OR formula_key = 'omzet';

-- Saldo: skip HPP, RETUR_HPP, RETUR_PENJUALAN_NONCASH.
UPDATE cashbook_formula
SET ast = '{"type":"if","cond":{"type":"or","left":{"type":"or","left":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"HPP"}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_HPP"}}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_PENJUALAN_NONCASH"}}},"then":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"literal","value":0},"else":{"type":"prevOutput","column":"J"}},"else":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"binaryOp","op":"-","left":{"type":"columnRef","column":"D"},"right":{"type":"columnRef","column":"E"}},"else":{"type":"binaryOp","op":"-","left":{"type":"binaryOp","op":"+","left":{"type":"prevOutput","column":"J"},"right":{"type":"columnRef","column":"D"}},"right":{"type":"columnRef","column":"E"}}}}'::jsonb,
    description = 'Saldo kas berjalan; HPP, RETUR_HPP, dan RETUR_PENJUALAN_NONCASH tidak mengubah kas.'
WHERE column_key = 'J' OR db_column = 'saldo' OR formula_key = 'saldo';
