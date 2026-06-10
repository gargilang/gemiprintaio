-- ════════════════════════════════════════════════════════════════════════════
-- Naikkan presisi semua kolom uang/angka dari REAL (float4) ke DOUBLE PRECISION.
--
-- Masalah: Postgres REAL = single-precision float (float4), hanya akurat ~6-7
-- digit penting. Angka di atas ~16 juta (mis. 36.470.408) jadi dibulatkan ke
-- 6 digit penting (36.470.400). DOUBLE PRECISION (float8) akurat ~15 digit,
-- cukup untuk rupiah triliunan.
--
-- Catatan: ini murni perbaikan sisi Postgres. SQLite menyimpan REAL sebagai
-- 8-byte IEEE float (sudah double), jadi runtime desktop tidak terpengaruh.
--
-- Strategi: tangkap definisi view yang bergantung ke kolom uang secara dinamis
-- (pakai pg_get_viewdef supaya kebal terhadap rename kolom di migrasi lain),
-- drop view-nya, konversi SEMUA kolom `real` di schema public ke
-- `double precision` (widening selalu aman — tidak ada data hilang), lalu buat
-- ulang view persis seperti semula + GRANT-nya.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r RECORD;
  v_keluaran TEXT;
  v_masukan TEXT;
  has_keluaran BOOLEAN := to_regclass('public.v_ppn_keluaran') IS NOT NULL;
  has_masukan BOOLEAN := to_regclass('public.v_ppn_masukan') IS NOT NULL;
BEGIN
  -- 1. Tangkap definisi view apa adanya (sudah mengikuti rename kolom terkini).
  IF has_keluaran THEN
    v_keluaran := pg_get_viewdef('public.v_ppn_keluaran'::regclass, true);
  END IF;
  IF has_masukan THEN
    v_masukan := pg_get_viewdef('public.v_ppn_masukan'::regclass, true);
  END IF;

  -- 2. Drop view (memblokir ALTER COLUMN TYPE pada kolom yang diseleksi).
  DROP VIEW IF EXISTS public.v_ppn_keluaran;
  DROP VIEW IF EXISTS public.v_ppn_masukan;

  -- 3. Konversi setiap kolom `real` di schema public menjadi `double precision`.
  FOR r IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type = 'real'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN %I TYPE double precision',
      r.table_name, r.column_name
    );
  END LOOP;

  -- 4. Buat ulang view dari definisi yang ditangkap + pulihkan GRANT.
  IF has_keluaran AND v_keluaran IS NOT NULL THEN
    EXECUTE 'CREATE VIEW public.v_ppn_keluaran AS ' || v_keluaran;
    EXECUTE 'GRANT SELECT ON public.v_ppn_keluaran TO anon, authenticated, service_role';
  END IF;
  IF has_masukan AND v_masukan IS NOT NULL THEN
    EXECUTE 'CREATE VIEW public.v_ppn_masukan AS ' || v_masukan;
    EXECUTE 'GRANT SELECT ON public.v_ppn_masukan TO anon, authenticated, service_role';
  END IF;
END $$;
