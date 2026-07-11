-- Migration: tambah role "demo" ke constraint profil_role_check
-- Role "demo" adalah akun hanya-baca level admin untuk keperluan demo produk.

ALTER TABLE "public"."profil"
  DROP CONSTRAINT IF EXISTS "profil_role_check";

ALTER TABLE "public"."profil"
  ADD CONSTRAINT "profil_role_check"
  CHECK (
    "role" = ANY (ARRAY[
      'admin'::text,
      'manager'::text,
      'staff'::text,
      'kasir'::text,
      'operator'::text,
      'user'::text,
      'demo'::text
    ])
  );
