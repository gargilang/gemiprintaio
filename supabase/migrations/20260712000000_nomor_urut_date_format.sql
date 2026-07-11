-- Tambah format tanggal terpisah untuk nomor faktur dan SPK.
-- Struktur nomor tetap memakai inv_format/spk_format; kolom ini hanya dipakai
-- saat format nomor berisi tanggal (PREFIX-DATE-SEQ).
ALTER TABLE "public"."pengaturan_toko"
  ADD COLUMN IF NOT EXISTS "inv_date_format" text NOT NULL DEFAULT 'YYYYMMDD'
    CHECK ("inv_date_format" IN ('YYYYMMDD', 'YYMMDD', 'DDMMYYYY', 'DDMMYY', 'YYYY-MM-DD', 'YYYY/MM/DD', 'YYYYMM', 'YYMM', 'MMYYYY', 'MMYY', 'DDMM', 'MMDD')),
  ADD COLUMN IF NOT EXISTS "spk_date_format" text NOT NULL DEFAULT 'YYYYMMDD'
    CHECK ("spk_date_format" IN ('YYYYMMDD', 'YYMMDD', 'DDMMYYYY', 'DDMMYY', 'YYYY-MM-DD', 'YYYY/MM/DD', 'YYYYMM', 'YYMM', 'MMYYYY', 'MMYY', 'DDMM', 'MMDD'));
