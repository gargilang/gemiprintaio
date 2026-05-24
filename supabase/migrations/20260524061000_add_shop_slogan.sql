-- Add business slogan used by print templates.
ALTER TABLE pengaturan_toko
  ADD COLUMN IF NOT EXISTS slogan TEXT;

UPDATE pengaturan_toko
SET slogan = COALESCE(slogan, 'Digital Printing & Advertising')
WHERE id = 'default';