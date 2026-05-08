-- One-off: set gemi password to "admin" (SHA-256). Run in SQLite client if row already exists (seed only affects new DBs).
-- Example: sqlite3 database/gemiprint.db < database/update-gemi-password-to-admin.sql
UPDATE profil
SET
  password_hash = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
  diperbarui_pada = datetime('now')
WHERE id = 'admin-gemi-001' OR nama_pengguna = 'gemi';
