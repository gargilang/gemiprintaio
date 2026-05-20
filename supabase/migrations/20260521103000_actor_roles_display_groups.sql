-- role_group was mistakenly tied to formula types (profit_share / cash_advance / bonus).
-- It is now a display category for job titles only. Formula types are configured
-- per actor via profit_share_percent / cash_advance_categories / bonus_percent.

-- Drop legacy CHECK (name may vary by Postgres version).
ALTER TABLE actor_roles DROP CONSTRAINT IF EXISTS actor_roles_role_group_check;

UPDATE actor_roles SET role_group = CASE role_group
  WHEN 'profit_share' THEN 'owner'
  WHEN 'cash_advance' THEN 'staff'
  WHEN 'bonus' THEN
    CASE role_code
      WHEN 'SALES' THEN 'sales'
      WHEN 'MANAGER' THEN 'management'
      WHEN 'SUPERVISOR' THEN 'management'
      ELSE 'management'
    END
  ELSE role_group
END
WHERE role_group IN ('profit_share', 'cash_advance', 'bonus');

ALTER TABLE actor_roles
  ADD CONSTRAINT actor_roles_role_group_check
  CHECK (role_group IN ('owner', 'management', 'sales', 'staff', 'other'));

-- Refresh seed labels to match the decoupled model.
INSERT INTO actor_roles (id, role_code, role_label, role_group, description, display_order) VALUES
  ('role-pemilik',    'PEMILIK',    'Pemilik / Investor',   'owner',      'Pemilik atau investor usaha',             10),
  ('role-direktur',   'DIREKTUR',   'Direktur',             'owner',      'Direksi / direktur',                      20),
  ('role-komisaris',  'KOMISARIS',  'Komisaris',            'owner',      'Komisaris / pengawas',                    30),
  ('role-manager',    'MANAGER',    'Manager',              'management', 'Manajer cabang / divisi',                 40),
  ('role-supervisor', 'SUPERVISOR', 'Supervisor',           'management', 'Pengawas operasional',                    50),
  ('role-sales',      'SALES',      'Sales / Marketing',    'sales',      'Tenaga penjual / pemasaran',              60),
  ('role-karyawan',   'KARYAWAN',   'Karyawan tetap',       'staff',      'Karyawan tetap',                          70),
  ('role-designer',   'DESIGNER',   'Designer / Operator',  'staff',      'Tenaga kreatif / operator cetak',         80),
  ('role-kasir',      'KASIR',      'Kasir / Front office', 'staff',      'Petugas kasir / front office',            90),
  ('role-kurir',      'KURIR',      'Kurir / Driver',       'staff',      'Pengantar / driver',                     100),
  ('role-lainnya',    'LAINNYA',    'Lainnya',              'other',      'Peran lain yang tidak tercakup di atas', 110)
ON CONFLICT (role_code) DO UPDATE SET
  role_group   = EXCLUDED.role_group,
  role_label   = EXCLUDED.role_label,
  description  = EXCLUDED.description;
