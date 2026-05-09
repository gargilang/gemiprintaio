-- Rename role 'chief' -> 'staff' and add new roles 'kasir' and 'operator'.
-- The existing CHECK constraint was created inline on profil.role with an
-- auto-generated name, so drop any matching constraint first to be safe.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.profil'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%admin%manager%'
  LOOP
    EXECUTE format('ALTER TABLE public.profil DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

UPDATE public.profil
SET role = 'staff',
    diperbarui_pada = NOW()
WHERE role = 'chief';

ALTER TABLE public.profil
  ADD CONSTRAINT profil_role_check
  CHECK (role IN ('admin', 'manager', 'staff', 'kasir', 'operator', 'user'));
