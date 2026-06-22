-- Tambah nilai 'POTONG_BAGI_HASIL' ke CHECK constraint kolom jenis.
-- Dipakai saat pengurus melunasi kasbon dengan bagi hasilnya (netting, tanpa kas fisik).
ALTER TABLE pinjaman_karyawan DROP CONSTRAINT IF EXISTS pinjaman_karyawan_jenis_check;
ALTER TABLE pinjaman_karyawan ADD CONSTRAINT pinjaman_karyawan_jenis_check
  CHECK (jenis = ANY (ARRAY['TARIK'::text, 'POTONG_GAJI'::text, 'BAYAR_TUNAI'::text, 'POTONG_BAGI_HASIL'::text]));
