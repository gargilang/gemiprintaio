-- Hapus kolom legacy spesifik-orang dari tabel keuangan.
-- Kolom kasbon_* dan bagi_hasil_* sudah digantikan oleh formula AST + transaction_computed.
-- Kolom override_* terkait dihapus karena tidak lagi relevan.
-- Data historis: tabel keuangan saat ini 0 baris, tidak ada data yang hilang.

ALTER TABLE keuangan DROP COLUMN IF EXISTS kasbon_anwar;
ALTER TABLE keuangan DROP COLUMN IF EXISTS kasbon_suri;
ALTER TABLE keuangan DROP COLUMN IF EXISTS kasbon_cahaya;
ALTER TABLE keuangan DROP COLUMN IF EXISTS kasbon_dinil;

ALTER TABLE keuangan DROP COLUMN IF EXISTS bagi_hasil_anwar;
ALTER TABLE keuangan DROP COLUMN IF EXISTS bagi_hasil_suri;
ALTER TABLE keuangan DROP COLUMN IF EXISTS bagi_hasil_gemi;

ALTER TABLE keuangan DROP COLUMN IF EXISTS override_kasbon_anwar;
ALTER TABLE keuangan DROP COLUMN IF EXISTS override_kasbon_suri;
ALTER TABLE keuangan DROP COLUMN IF EXISTS override_kasbon_cahaya;
ALTER TABLE keuangan DROP COLUMN IF EXISTS override_kasbon_dinil;

ALTER TABLE keuangan DROP COLUMN IF EXISTS override_bagi_hasil_anwar;
ALTER TABLE keuangan DROP COLUMN IF EXISTS override_bagi_hasil_suri;
ALTER TABLE keuangan DROP COLUMN IF EXISTS override_bagi_hasil_gemi;

-- Hapus seed participants legacy (nama orang spesifik).
-- finance_participants saat ini 0 baris. Seed baru datang dari DEFAULT_MAPPINGS generik.
DELETE FROM finance_participants WHERE participant_code IN ('ANWAR', 'SURI', 'GEMI', 'CAHAYA', 'DINIL');

-- Hapus seed metric mappings yang menunjuk ke kolom legacy (source_column akan di-refactor oleh kode).
DELETE FROM finance_metric_mappings WHERE source_column IN (
  'kasbon_anwar', 'kasbon_suri', 'kasbon_cahaya', 'kasbon_dinil',
  'bagi_hasil_anwar', 'bagi_hasil_suri', 'bagi_hasil_gemi'
);

-- Hapus seed column rules legacy (akan di-generate ulang dari DEFAULT_COLUMN_RULES yang baru).
DELETE FROM finance_metric_column_rules WHERE column_name IN (
  'kasbon_anwar', 'kasbon_suri', 'kasbon_cahaya', 'kasbon_dinil',
  'bagi_hasil_anwar', 'bagi_hasil_suri', 'bagi_hasil_gemi'
);
