-- Align existing rows: user gemi → password plaintext "admin" (SHA-256, same as /api/auth/login)
UPDATE profil
SET
  password_hash = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
  diperbarui_pada = NOW()
WHERE id = 'admin-gemi-001' OR nama_pengguna = 'gemi';
