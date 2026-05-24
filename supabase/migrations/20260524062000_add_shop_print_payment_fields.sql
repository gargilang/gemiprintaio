-- Add customizable print and payment fields for business profile.
ALTER TABLE pengaturan_toko
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS bank_nama TEXT,
  ADD COLUMN IF NOT EXISTS bank_nomor TEXT,
  ADD COLUMN IF NOT EXISTS bank_atas_nama TEXT,
  ADD COLUMN IF NOT EXISTS catatan_faktur TEXT,
  ADD COLUMN IF NOT EXISTS catatan_struk TEXT;

UPDATE pengaturan_toko
SET
  bank_nama = COALESCE(bank_nama, 'BCA'),
  bank_nomor = COALESCE(bank_nomor, '6881276507'),
  bank_atas_nama = COALESCE(bank_atas_nama, 'Grafika Estetika Media Internusa'),
  catatan_faktur = COALESCE(catatan_faktur, 'Barang yang sudah dibawa tidak bisa ditukar/dikembalikan.'),
  catatan_struk = COALESCE(catatan_struk, 'Barang yang sudah dibeli tidak dapat dikembalikan')
WHERE id = 'default';