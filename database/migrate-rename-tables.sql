-- Migration Script: Rename old table names to new names
-- Run this script to migrate your existing database to the new schema

-- Step 1: Rename material_subcategories to subkategori_barang if it exists
-- SQLite doesn't support direct table rename with foreign keys, so we need to create new table and copy data

-- First, check if old table exists and new table doesn't exist
-- If material_subcategories exists, create the new structure

BEGIN TRANSACTION;

-- Create new subkategori_barang table if it doesn't exist
CREATE TABLE IF NOT EXISTS subkategori_barang (
  id TEXT PRIMARY KEY,
  kategori_id TEXT NOT NULL,
  nama TEXT NOT NULL,
  urutan_tampilan INTEGER DEFAULT 0,
  dibuat_pada TEXT DEFAULT (datetime('now')),
  diperbarui_pada TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (kategori_id) REFERENCES kategori_barang(id) ON DELETE CASCADE
);

-- Copy data from material_subcategories to subkategori_barang if old table exists
INSERT OR IGNORE INTO subkategori_barang (id, kategori_id, nama, urutan_tampilan, dibuat_pada, diperbarui_pada)
SELECT id, category_id as kategori_id, nama, urutan_tampilan, dibuat_pada, diperbarui_pada
FROM material_subcategories
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='material_subcategories');

-- Drop the old table
DROP TABLE IF EXISTS material_subcategories;

COMMIT;

-- Verify the migration
SELECT 'Migration completed. Rows in subkategori_barang:' as status, COUNT(*) as count FROM subkategori_barang;
