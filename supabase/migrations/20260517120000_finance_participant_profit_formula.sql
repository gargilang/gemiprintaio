-- Profit-share settings per participant (drives cashbook recalc + Keuangan UI)
ALTER TABLE finance_participants
  ADD COLUMN IF NOT EXISTS profit_formula TEXT
    CHECK (profit_formula IS NULL OR profit_formula IN ('third_minus_kasbon', 'incremental_investor')),
  ADD COLUMN IF NOT EXISTS share_divisor INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS bagi_hasil_column TEXT,
  ADD COLUMN IF NOT EXISTS kasbon_column TEXT,
  ADD COLUMN IF NOT EXISTS pribadi_kategori TEXT;

UPDATE finance_participants SET
  profit_formula = 'third_minus_kasbon',
  share_divisor = 3,
  bagi_hasil_column = 'bagi_hasil_anwar',
  kasbon_column = 'kasbon_anwar',
  pribadi_kategori = 'PRIBADI-A'
WHERE id = 'fin-participant-anwar';

UPDATE finance_participants SET
  profit_formula = 'third_minus_kasbon',
  share_divisor = 3,
  bagi_hasil_column = 'bagi_hasil_suri',
  kasbon_column = 'kasbon_suri',
  pribadi_kategori = 'PRIBADI-S'
WHERE id = 'fin-participant-suri';

UPDATE finance_participants SET
  profit_formula = 'incremental_investor',
  share_divisor = 3,
  bagi_hasil_column = 'bagi_hasil_gemi',
  kasbon_column = NULL,
  pribadi_kategori = NULL
WHERE id = 'fin-participant-gemi';
