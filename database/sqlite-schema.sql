-- SQLite Schema for gemiprintaio (Offline Database)
-- This is equivalent to the PostgreSQL schema but adapted for SQLite

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Users/Profiles table
CREATE TABLE IF NOT EXISTS profil (
  id TEXT PRIMARY KEY,
  nama_pengguna TEXT UNIQUE NOT NULL,
  -- Email kini opsional (nullable). UNIQUE di SQLite mengizinkan banyak NULL.
  email TEXT UNIQUE,
  nama_lengkap TEXT,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'manager', 'chief', 'user')),
  aktif_status INTEGER DEFAULT 1,
  dibuat_pada TEXT DEFAULT (datetime('now')),
  diperbarui_pada TEXT DEFAULT (datetime('now'))
);

-- Default admin user (username: gemi, password: 5555)
-- Password hash for "5555" using SHA-256
INSERT OR IGNORE INTO profil (id, nama_pengguna, email, nama_lengkap, password_hash, role, aktif_status)
VALUES (
  'admin-gemi-001',
  'gemi',
  'admin@gemiprint.com',
  'Gemi Administrator',
  'c1f330d0aff31c1c87403f1e4347bcc21aff7c179908723535f2b31723702525',
  'admin',
  1
);

-- Master Kategori Bahan
CREATE TABLE IF NOT EXISTS kategori_bahan (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL UNIQUE,
  butuh_spesifikasi_status INTEGER DEFAULT 0, -- Flag: apakah kategori ini perlu quick specs
  urutan_tampilan INTEGER DEFAULT 0,
  dibuat_pada TEXT DEFAULT (datetime('now')),
  diperbarui_pada TEXT DEFAULT (datetime('now'))
);

-- Master Subkategori Bahan
CREATE TABLE IF NOT EXISTS subkategori_bahan (
  id TEXT PRIMARY KEY,
  kategori_id TEXT NOT NULL,
  nama TEXT NOT NULL,
  urutan_tampilan INTEGER DEFAULT 0,
  dibuat_pada TEXT DEFAULT (datetime('now')),
  diperbarui_pada TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (kategori_id) REFERENCES kategori_bahan(id) ON DELETE CASCADE
);

-- Master Satuan Bahan
CREATE TABLE IF NOT EXISTS satuan_bahan (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL UNIQUE,
  urutan_tampilan INTEGER DEFAULT 0,
  dibuat_pada TEXT DEFAULT (datetime('now')),
  diperbarui_pada TEXT DEFAULT (datetime('now'))
);

-- Master Spesifikasi Cepat Bahan (untuk Spek Cepat seperti ukuran kertas, gramasi, dll)
CREATE TABLE IF NOT EXISTS spesifikasi_cepat_bahan (
  id TEXT PRIMARY KEY,
  kategori_id TEXT NOT NULL,
  tipe_spesifikasi TEXT NOT NULL, -- 'size', 'weight', 'width', 'thickness', dll
  nilai_spesifikasi TEXT NOT NULL,
  urutan_tampilan INTEGER DEFAULT 0,
  dibuat_pada TEXT DEFAULT (datetime('now')),
  diperbarui_pada TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (kategori_id) REFERENCES kategori_bahan(id) ON DELETE CASCADE
);

-- Default Material Categories
INSERT OR IGNORE INTO kategori_bahan (id, nama, butuh_spesifikasi_status, urutan_tampilan) VALUES
  ('cat-media-cetak', 'Media Cetak', 0, 1),
  ('cat-kertas', 'Kertas', 1, 2),
  ('cat-kertas-foto', 'Kertas Foto', 1, 3),
  ('cat-merchandise', 'Merchandise', 0, 4),
  ('cat-substrat-uv', 'Substrat UV', 0, 5),
  ('cat-tinta-consumables', 'Tinta & Consumables', 0, 6),
  ('cat-finishing', 'Finishing', 1, 7),
  ('cat-lain-lain', 'Lain-lain', 0, 8);

-- Default Subcategories for Media Cetak
INSERT OR IGNORE INTO subkategori_bahan (id, kategori_id, nama, urutan_tampilan) VALUES
  ('sub-mc-flexi', 'cat-media-cetak', 'Flexi/Banner', 1),
  ('sub-mc-vinyl', 'cat-media-cetak', 'Vinyl', 2),
  ('sub-mc-sticker', 'cat-media-cetak', 'Sticker', 3),
  ('sub-mc-backlit', 'cat-media-cetak', 'Backlit', 4),
  ('sub-mc-owv', 'cat-media-cetak', 'One Way Vision', 5),
  ('sub-mc-albatross', 'cat-media-cetak', 'Albatross', 6),
  ('sub-mc-canvas', 'cat-media-cetak', 'Canvas', 7),
  ('sub-mc-lainlain', 'cat-media-cetak', 'Lain-lain', 99);

-- Default Subcategories for Kertas
INSERT OR IGNORE INTO subkategori_bahan (id, kategori_id, nama, urutan_tampilan) VALUES
  ('sub-kr-hvs', 'cat-kertas', 'HVS', 1),
  ('sub-kr-art-paper', 'cat-kertas', 'Art Paper', 2),
  ('sub-kr-art-carton', 'cat-kertas', 'Art Carton', 3),
  ('sub-kr-ivory', 'cat-kertas', 'Ivory', 4),
  ('sub-kr-duplex', 'cat-kertas', 'Duplex', 5),
  ('sub-kr-bc-bw', 'cat-kertas', 'BC/BW', 6),
  ('sub-kr-kraft', 'cat-kertas', 'Kraft', 7),
  ('sub-kr-jasmine', 'cat-kertas', 'Jasmine', 8),
  ('sub-kr-concorde', 'cat-kertas', 'Concorde', 9),
  ('sub-kr-linen', 'cat-kertas', 'Linen', 10),
  ('sub-kr-foto', 'cat-kertas', 'Foto Paper', 11),
  ('sub-kr-lainlain', 'cat-kertas', 'Lain-lain', 99);

-- Default Subcategories for Kertas Foto
INSERT OR IGNORE INTO subkategori_bahan (id, kategori_id, nama, urutan_tampilan) VALUES
  ('sub-kf-glossy', 'cat-kertas-foto', 'Photo Paper Glossy', 1),
  ('sub-kf-matte', 'cat-kertas-foto', 'Photo Paper Matte', 2),
  ('sub-kf-luster', 'cat-kertas-foto', 'Photo Paper Luster', 3),
  ('sub-kf-rc', 'cat-kertas-foto', 'RC Paper', 4),
  ('sub-kf-inkjet', 'cat-kertas-foto', 'Inkjet Paper', 5);

-- Default Subcategories for Merchandise
INSERT OR IGNORE INTO subkategori_bahan (id, kategori_id, nama, urutan_tampilan) VALUES
  ('sub-md-totebag', 'cat-merchandise', 'Tote Bag', 1),
  ('sub-md-gelas', 'cat-merchandise', 'Gelas/Mug', 2),
  ('sub-md-kaos', 'cat-merchandise', 'Kaos', 3),
  ('sub-md-payung', 'cat-merchandise', 'Payung', 4),
  ('sub-md-pin', 'cat-merchandise', 'Pin/Badge', 5),
  ('sub-md-gantungan', 'cat-merchandise', 'Gantungan Kunci', 6),
  ('sub-md-idcard', 'cat-merchandise', 'ID Card', 7),
  ('sub-md-lanyard', 'cat-merchandise', 'Lanyard', 8),
  ('sub-md-tumbler', 'cat-merchandise', 'Tumbler', 9),
  ('sub-md-notebook', 'cat-merchandise', 'Notebook', 10),
  ('sub-md-pulpen', 'cat-merchandise', 'Pulpen', 11),
  ('sub-md-lainlain', 'cat-merchandise', 'Lain-lain', 99);

-- Default Subcategories for Substrat UV
INSERT OR IGNORE INTO subkategori_bahan (id, kategori_id, nama, urutan_tampilan) VALUES
  ('sub-uv-akrilik', 'cat-substrat-uv', 'Akrilik', 1),
  ('sub-uv-kayu', 'cat-substrat-uv', 'Kayu', 2),
  ('sub-uv-mdf', 'cat-substrat-uv', 'MDF', 3),
  ('sub-uv-aluminium', 'cat-substrat-uv', 'Aluminium', 4),
  ('sub-uv-kaca', 'cat-substrat-uv', 'Kaca', 5),
  ('sub-uv-keramik', 'cat-substrat-uv', 'Keramik', 6),
  ('sub-uv-plastik', 'cat-substrat-uv', 'Plastik/PVC', 7),
  ('sub-uv-metal', 'cat-substrat-uv', 'Metal', 8),
  ('sub-uv-kulit', 'cat-substrat-uv', 'Kulit', 9),
  ('sub-uv-lainlain', 'cat-substrat-uv', 'Lain-lain', 99);

-- Default Subcategories for Tinta & Consumables
INSERT OR IGNORE INTO subkategori_bahan (id, kategori_id, nama, urutan_tampilan) VALUES
  ('sub-tc-eco', 'cat-tinta-consumables', 'Tinta Eco Solvent', 1),
  ('sub-tc-uv', 'cat-tinta-consumables', 'Tinta UV', 2),
  ('sub-tc-sublim', 'cat-tinta-consumables', 'Tinta Sublim', 3),
  ('sub-tc-pigment', 'cat-tinta-consumables', 'Tinta Pigment', 4),
  ('sub-tc-dye', 'cat-tinta-consumables', 'Tinta Dye', 5),
  ('sub-tc-cleaning', 'cat-tinta-consumables', 'Cleaning Solution', 6),
  ('sub-tc-lainlain', 'cat-tinta-consumables', 'Lain-lain', 99);

-- Default Subcategories for Finishing
INSERT OR IGNORE INTO subkategori_bahan (id, kategori_id, nama, urutan_tampilan) VALUES
  ('sub-fn-lam-glossy', 'cat-finishing', 'Laminating Glossy', 1),
  ('sub-fn-lam-doff', 'cat-finishing', 'Laminating Doff', 2),
  ('sub-fn-lam-sandblast', 'cat-finishing', 'Laminating Sandblast', 3),
  ('sub-fn-foam', 'cat-finishing', 'Foam Board', 4),
  ('sub-fn-kaca', 'cat-finishing', 'Kaca Acrylic', 5),
  ('sub-fn-bingkai', 'cat-finishing', 'Bingkai', 6),
  ('sub-fn-double-tape', 'cat-finishing', 'Double Tape', 7),
  ('sub-fn-lem', 'cat-finishing', 'Lem', 8),
  ('sub-fn-lainlain', 'cat-finishing', 'Lain-lain', 99);

-- Default Subcategories for Lain-lain
INSERT OR IGNORE INTO subkategori_bahan (id, kategori_id, nama, urutan_tampilan) VALUES
  ('sub-ll-umum', 'cat-lain-lain', 'Umum', 1);

-- Default Material Units
INSERT OR IGNORE INTO satuan_bahan (id, nama, urutan_tampilan) VALUES
  ('unit-meter', 'meter', 1),
  ('unit-roll', 'roll', 2),
  ('unit-sheet', 'sheet', 3),
  ('unit-lembar', 'lembar', 4),
  ('unit-rim', 'rim', 5),
  ('unit-pack', 'pack', 6),
  ('unit-pcs', 'pcs', 7),
  ('unit-lusin', 'lusin', 8),
  ('unit-box', 'box', 9),
  ('unit-liter', 'liter', 10),
  ('unit-ml', 'ml', 11),
  ('unit-botol', 'botol', 12),
  ('unit-cartridge', 'cartridge', 13),
  ('unit-unit', 'unit', 14);

-- Default Quick Specs for Kertas (sizes)
INSERT OR IGNORE INTO spesifikasi_cepat_bahan (id, kategori_id, tipe_spesifikasi, nilai_spesifikasi, urutan_tampilan) VALUES
  ('spec-kr-size-a0', 'cat-kertas', 'size', 'A0', 1),
  ('spec-kr-size-a1', 'cat-kertas', 'size', 'A1', 2),
  ('spec-kr-size-a2', 'cat-kertas', 'size', 'A2', 3),
  ('spec-kr-size-a3', 'cat-kertas', 'size', 'A3', 4),
  ('spec-kr-size-a3plus', 'cat-kertas', 'size', 'A3+', 5),
  ('spec-kr-size-a4', 'cat-kertas', 'size', 'A4', 6),
  ('spec-kr-size-a5', 'cat-kertas', 'size', 'A5', 7),
  ('spec-kr-size-a6', 'cat-kertas', 'size', 'A6', 8),
  ('spec-kr-size-b4', 'cat-kertas', 'size', 'B4', 9),
  ('spec-kr-size-b5', 'cat-kertas', 'size', 'B5', 10),
  ('spec-kr-size-letter', 'cat-kertas', 'size', 'Letter', 11),
  ('spec-kr-size-legal', 'cat-kertas', 'size', 'Legal', 12),
  ('spec-kr-size-ledger', 'cat-kertas', 'size', 'Ledger', 13),
  ('spec-kr-size-tabloid', 'cat-kertas', 'size', 'Tabloid', 14),
  ('spec-kr-size-f4', 'cat-kertas', 'size', 'F4', 15),
  ('spec-kr-size-folio', 'cat-kertas', 'size', 'Folio', 16),
  ('spec-kr-size-r4', 'cat-kertas', 'size', 'R4 (10x15cm)', 17),
  ('spec-kr-size-r8', 'cat-kertas', 'size', 'R8 (13x18cm)', 18),
  ('spec-kr-size-r16', 'cat-kertas', 'size', 'R16 (20x30cm)', 19),
  ('spec-kr-size-custom', 'cat-kertas', 'size', 'Custom', 99);

-- Default Quick Specs for Kertas (weights/gramasi)
INSERT OR IGNORE INTO spesifikasi_cepat_bahan (id, kategori_id, tipe_spesifikasi, nilai_spesifikasi, urutan_tampilan) VALUES
  ('spec-kr-weight-60', 'cat-kertas', 'weight', '60 gsm', 1),
  ('spec-kr-weight-70', 'cat-kertas', 'weight', '70 gsm', 2),
  ('spec-kr-weight-80', 'cat-kertas', 'weight', '80 gsm', 3),
  ('spec-kr-weight-100', 'cat-kertas', 'weight', '100 gsm', 4),
  ('spec-kr-weight-120', 'cat-kertas', 'weight', '120 gsm', 5),
  ('spec-kr-weight-150', 'cat-kertas', 'weight', '150 gsm', 6),
  ('spec-kr-weight-190', 'cat-kertas', 'weight', '190 gsm', 7),
  ('spec-kr-weight-210', 'cat-kertas', 'weight', '210 gsm', 8),
  ('spec-kr-weight-230', 'cat-kertas', 'weight', '230 gsm', 9),
  ('spec-kr-weight-260', 'cat-kertas', 'weight', '260 gsm', 10),
  ('spec-kr-weight-310', 'cat-kertas', 'weight', '310 gsm', 11),
  ('spec-kr-weight-400', 'cat-kertas', 'weight', '400 gsm', 12);

-- Default Quick Specs for Kertas Foto (same as Kertas)
INSERT OR IGNORE INTO spesifikasi_cepat_bahan (id, kategori_id, tipe_spesifikasi, nilai_spesifikasi, urutan_tampilan)
SELECT 
  REPLACE(id, 'cat-kertas', 'cat-kertas-foto'),
  'cat-kertas-foto',
  spec_type,
  spec_value,
  display_order
FROM spesifikasi_cepat_bahan WHERE kategori_id = 'cat-kertas';

-- Materials/Bahan table (updated with category/subcategory references)
CREATE TABLE IF NOT EXISTS bahan (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  deskripsi TEXT,
  kategori_id TEXT,
  subkategori_id TEXT,
  satuan_dasar TEXT NOT NULL, -- Satuan terkecil untuk tracking stok (pcs, meter, lembar, dll)
  spesifikasi TEXT,
  jumlah_stok REAL DEFAULT 0, -- Stok dalam satuan satuan_dasar
  level_stok_minimum REAL DEFAULT 0,
  lacak_inventori_status INTEGER DEFAULT 1, -- 1 = track stok, 0 = tidak perlu track (contoh: lem, minyak goreng, tinta)
  butuh_dimensi_status INTEGER DEFAULT 0, -- 1 = perlu input P×L di POS (banner, vinyl, flexi), 0 = input qty biasa
  dibuat_pada TEXT DEFAULT (datetime('now')),
  diperbarui_pada TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (kategori_id) REFERENCES material_categories(id) ON DELETE SET NULL,
  FOREIGN KEY (subkategori_id) REFERENCES material_subcategories(id) ON DELETE SET NULL
);

-- Material Unit Prices (Multiple satuan dengan harga berbeda)
CREATE TABLE IF NOT EXISTS harga_bahan_satuan (
  id TEXT PRIMARY KEY,
  bahan_id TEXT NOT NULL,
  nama_satuan TEXT NOT NULL, -- pcs, lusin, pack, box, meter, roll, dll
  faktor_konversi REAL NOT NULL, -- Konversi ke satuan_dasar (contoh: 1 lusin = 12 pcs, maka faktor_konversi = 12)
  harga_beli REAL DEFAULT 0,
  harga_jual REAL DEFAULT 0,
  harga_member REAL DEFAULT 0,
  default_status INTEGER DEFAULT 0, -- Satuan default untuk transaksi
  urutan_tampilan INTEGER DEFAULT 0,
  dibuat_pada TEXT DEFAULT (datetime('now')),
  diperbarui_pada TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (bahan_id) REFERENCES bahan(id) ON DELETE CASCADE,
  UNIQUE(bahan_id, nama_satuan)
);

-- Customers table
CREATE TABLE IF NOT EXISTS pelanggan (
  id TEXT PRIMARY KEY,
  tipe_pelanggan TEXT NOT NULL CHECK(tipe_pelanggan IN ('perorangan', 'perusahaan')),
  nama TEXT NOT NULL,
  nama_perusahaan TEXT,
  npwp TEXT,
  email TEXT,
  telepon TEXT,
  alamat TEXT,
  member_status INTEGER DEFAULT 0,
  dibuat_pada TEXT DEFAULT (datetime('now')),
  diperbarui_pada TEXT DEFAULT (datetime('now'))
);

-- Vendors table
CREATE TABLE IF NOT EXISTS vendor (
  id TEXT PRIMARY KEY,
  nama_perusahaan TEXT NOT NULL,
  email TEXT,
  telepon TEXT,
  alamat TEXT,
  kontak_person TEXT,
  ketentuan_bayar TEXT,
  aktif_status INTEGER DEFAULT 1,
  catatan TEXT,
  dibuat_pada TEXT DEFAULT (datetime('now')),
  diperbarui_pada TEXT DEFAULT (datetime('now'))
);

-- Sales/POS Transactions
CREATE TABLE IF NOT EXISTS penjualan (
  id TEXT PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,
  customer_id TEXT,
  total_amount REAL NOT NULL,
  paid_amount REAL DEFAULT 0,
  change_amount REAL DEFAULT 0,
  payment_method TEXT,
  cashier_id TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES pelanggan(id),
  FOREIGN KEY (cashier_id) REFERENCES profil(id)
);

-- Sales Items
CREATE TABLE IF NOT EXISTS item_penjualan (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  material_id TEXT NOT NULL,
  unit_price_id TEXT, -- Reference ke material_unit_prices untuk tahu satuan & harga yang dipakai
  quantity REAL NOT NULL, -- Jumlah dalam satuan yang dipilih
  unit_name TEXT NOT NULL, -- Nama satuan yang digunakan (pcs, lusin, pack)
  conversion_factor REAL NOT NULL, -- Konversi ke base_unit untuk update stok
  unit_price REAL NOT NULL, -- Harga per satuan yang dipilih
  subtotal REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (sale_id) REFERENCES penjualan(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES bahan(id),
  FOREIGN KEY (unit_price_id) REFERENCES harga_bahan_satuan(id)
);

-- Purchase Orders
CREATE TABLE IF NOT EXISTS pembelian (
  id TEXT PRIMARY KEY,
  purchase_number TEXT UNIQUE NOT NULL,
  vendor_id TEXT,
  total_amount REAL NOT NULL,
  paid_amount REAL DEFAULT 0,
  payment_method TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (vendor_id) REFERENCES vendor(id),
  FOREIGN KEY (created_by) REFERENCES profil(id)
);

-- Purchase Items
CREATE TABLE IF NOT EXISTS item_pembelian (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL,
  material_id TEXT NOT NULL,
  unit_price_id TEXT, -- Reference ke material_unit_prices
  quantity REAL NOT NULL, -- Jumlah dalam satuan yang dipilih
  unit_name TEXT NOT NULL, -- Nama satuan yang digunakan
  conversion_factor REAL NOT NULL, -- Konversi ke base_unit
  unit_price REAL NOT NULL, -- Harga per satuan yang dipilih
  subtotal REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (purchase_id) REFERENCES pembelian(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES bahan(id),
  FOREIGN KEY (unit_price_id) REFERENCES harga_bahan_satuan(id)
);





-- =====================================================
-- SISTEM KEUANGAN TERPISAH (Independent Finance System)
-- =====================================================



-- Tabel Buku Kas (Keuangan) - Manual Input
CREATE TABLE IF NOT EXISTS keuangan (
  id TEXT PRIMARY KEY,
  tanggal TEXT NOT NULL,
  kategori_transaksi TEXT NOT NULL CHECK(kategori_transaksi IN (
    'KAS', 'BIAYA', 'OMZET', 'INVESTOR', 'SUBSIDI', 'LUNAS', 
    'SUPPLY', 'LABA', 'KOMISI', 'TABUNGAN', 'HUTANG', 'PIUTANG', 
    'PRIBADI-A', 'PRIBADI-S'
  )),
  debit REAL DEFAULT 0,
  kredit REAL DEFAULT 0,
  keperluan TEXT,
  
  -- Breakdown Otomatis (Calculated Fields)
  omzet REAL DEFAULT 0,
  biaya_operasional REAL DEFAULT 0,
  biaya_bahan REAL DEFAULT 0,
  
  -- Saldo Running (akan dihitung dengan trigger)
  saldo REAL DEFAULT 0,
  laba_bersih REAL DEFAULT 0,
  
  -- Kasbon (Akan dilink ke tabel kasbon)
  kasbon_anwar REAL DEFAULT 0,
  kasbon_suri REAL DEFAULT 0,
  kasbon_cahaya REAL DEFAULT 0,
  kasbon_dinil REAL DEFAULT 0,
  
  -- Bagi Hasil (Akan dilink ke tabel bagi hasil)
  bagi_hasil_anwar REAL DEFAULT 0,
  bagi_hasil_suri REAL DEFAULT 0,
  bagi_hasil_gemi REAL DEFAULT 0,
  
  catatan TEXT,
  dibuat_oleh TEXT,
  
  -- Archive fields
  diarsipkan_pada TEXT,
  label_arsip TEXT,
  
  dibuat_pada TEXT DEFAULT (datetime('now')),
  diperbarui_pada TEXT DEFAULT (datetime('now')),
  urutan_tampilan INTEGER DEFAULT 0,
  override_saldo INTEGER DEFAULT 0,
  override_omzet INTEGER DEFAULT 0,
  override_biaya_operasional INTEGER DEFAULT 0,
  override_biaya_bahan INTEGER DEFAULT 0,
  override_laba_bersih INTEGER DEFAULT 0,
  override_kasbon_anwar INTEGER DEFAULT 0,
  override_kasbon_suri INTEGER DEFAULT 0,
  override_kasbon_cahaya INTEGER DEFAULT 0,
  override_kasbon_dinil INTEGER DEFAULT 0,
  override_bagi_hasil_anwar INTEGER DEFAULT 0,
  override_bagi_hasil_suri INTEGER DEFAULT 0,
  override_bagi_hasil_gemi INTEGER DEFAULT 0,
  FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
);

















-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_tipe ON customers(tipe_pelanggan);
CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(name);
CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_purchases_number ON purchases(purchase_number);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(created_at);
CREATE INDEX IF NOT EXISTS idx_financial_kategori ON financial_transactions(kategori_transaksi);
CREATE INDEX IF NOT EXISTS idx_financial_paid ON financial_transactions(is_paid);
CREATE INDEX IF NOT EXISTS idx_other_kategori ON other_transactions(kategori_transaksi);
CREATE INDEX IF NOT EXISTS idx_inventory_material ON inventory_movements(material_id);
CREATE INDEX IF NOT EXISTS idx_inventory_date ON inventory_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_sync_queue_synced ON sync_queue(synced);
CREATE INDEX IF NOT EXISTS idx_sync_queue_table ON sync_queue(table_name);

-- Credentials / Password Manager
CREATE TABLE IF NOT EXISTS kredensial (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  account_username TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  notes TEXT,
  is_private INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES profil(id)
);
CREATE INDEX IF NOT EXISTS idx_credentials_owner ON credentials(owner_id);
CREATE INDEX IF NOT EXISTS idx_credentials_service ON credentials(service_name);

-- Indexes untuk sistem keuangan
CREATE INDEX IF NOT EXISTS idx_keuangan_tanggal ON keuangan(tanggal);
CREATE INDEX IF NOT EXISTS idx_keuangan_kategori ON keuangan(kategori_transaksi);






CREATE INDEX IF NOT EXISTS idx_monthly_reports_periode ON monthly_financial_reports(periode_bulan);



-- Triggers for updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_profiles_timestamp 
  AFTER UPDATE ON profiles
  BEGIN
    UPDATE profil SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_materials_timestamp 
  AFTER UPDATE ON materials
  BEGIN
    UPDATE bahan SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_customers_timestamp 
  AFTER UPDATE ON customers
  BEGIN
    UPDATE pelanggan SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_vendors_timestamp 
  AFTER UPDATE ON vendors
  BEGIN
    UPDATE vendor SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_sales_timestamp 
  AFTER UPDATE ON sales
  BEGIN
    UPDATE penjualan SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_purchases_timestamp 
  AFTER UPDATE ON purchases
  BEGIN
    UPDATE pembelian SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_financial_timestamp 
  AFTER UPDATE ON financial_transactions
  BEGIN
    UPDATE financial_transactions SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_other_timestamp 
  AFTER UPDATE ON other_transactions
  BEGIN
    UPDATE other_transactions SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

-- Triggers untuk sistem keuangan
CREATE TRIGGER IF NOT EXISTS update_keuangan_timestamp 
  AFTER UPDATE ON keuangan
  BEGIN
    UPDATE keuangan SET diperbarui_pada = datetime('now') WHERE id = NEW.id;
  END;









-- Trigger untuk auto-update sisa_hutang kasbon ketika ada pembayaran
CREATE TRIGGER IF NOT EXISTS update_kasbon_sisa_hutang
  AFTER INSERT ON kasbon_payments
  BEGIN
    UPDATE kasbon 
    SET 
      sisa_hutang = amount - (
        SELECT COALESCE(SUM(amount_paid), 0) 
        FROM kasbon_payments 
        WHERE kasbon_id = NEW.kasbon_id
      ),
      status = CASE 
        WHEN (amount - (
          SELECT COALESCE(SUM(amount_paid), 0) 
          FROM kasbon_payments 
          WHERE kasbon_id = NEW.kasbon_id
        )) <= 0 THEN 'lunas'
        WHEN (
          SELECT COALESCE(SUM(amount_paid), 0) 
          FROM kasbon_payments 
          WHERE kasbon_id = NEW.kasbon_id
        ) > 0 THEN 'sebagian'
        ELSE 'belum_lunas'
      END,
      updated_at = datetime('now')
    WHERE id = NEW.kasbon_id;
  END;

-- Initialize sync_metadata table
INSERT OR IGNORE INTO sync_metadata (table_name, last_sync_at, last_sync_status, pending_changes)
VALUES 
  ('profiles', NULL, 'never', 0),
  ('materials', NULL, 'never', 0),
  ('customers', NULL, 'never', 0),
  ('vendors', NULL, 'never', 0),
  ('sales', NULL, 'never', 0),
  ('sales_items', NULL, 'never', 0),
  ('purchases', NULL, 'never', 0),
  ('purchase_items', NULL, 'never', 0),
  ('financial_transactions', NULL, 'never', 0),
  ('other_transactions', NULL, 'never', 0),
  ('inventory_movements', NULL, 'never', 0),
  ('keuangan', NULL, 'never', 0),






-- =====================================================
-- HUTANG & PIUTANG SYSTEM
-- =====================================================









-- Trigger untuk update status hutang setelah pembayaran
CREATE TRIGGER IF NOT EXISTS update_payable_after_payment
  AFTER INSERT ON payable_payments
  BEGIN
    UPDATE payables
    SET 
      paid_amount = (
        SELECT COALESCE(SUM(amount_paid), 0)
        FROM payable_payments
        WHERE payable_id = NEW.payable_id
      ),
      remaining_amount = total_amount - (
        SELECT COALESCE(SUM(amount_paid), 0)
        FROM payable_payments
        WHERE payable_id = NEW.payable_id
      ),
      status = CASE
        WHEN total_amount - (
          SELECT COALESCE(SUM(amount_paid), 0)
          FROM payable_payments
          WHERE payable_id = NEW.payable_id
        ) <= 0 THEN 'paid'
        WHEN (
          SELECT COALESCE(SUM(amount_paid), 0)
          FROM payable_payments
          WHERE payable_id = NEW.payable_id
        ) > 0 THEN 'partial'
        ELSE 'unpaid'
      END,
      updated_at = datetime('now')
    WHERE id = NEW.payable_id;
  END;

-- Trigger untuk update status piutang setelah pembayaran
CREATE TRIGGER IF NOT EXISTS update_receivable_after_payment
  AFTER INSERT ON receivable_payments
  BEGIN
    UPDATE receivables
    SET 
      paid_amount = (
        SELECT COALESCE(SUM(amount_paid), 0)
        FROM receivable_payments
        WHERE receivable_id = NEW.receivable_id
      ),
      remaining_amount = total_amount - (
        SELECT COALESCE(SUM(amount_paid), 0)
        FROM receivable_payments
        WHERE receivable_id = NEW.receivable_id
      ),
      status = CASE
        WHEN total_amount - (
          SELECT COALESCE(SUM(amount_paid), 0)
          FROM receivable_payments
          WHERE receivable_id = NEW.receivable_id
        ) <= 0 THEN 'paid'
        WHEN (
          SELECT COALESCE(SUM(amount_paid), 0)
          FROM receivable_payments
          WHERE receivable_id = NEW.receivable_id
        ) > 0 THEN 'partial'
        ELSE 'unpaid'
      END,
      updated_at = datetime('now')
    WHERE id = NEW.receivable_id;
  END;

-- Add to sync_metadata
INSERT OR IGNORE INTO sync_metadata (table_name, last_sync_at, last_sync_status, pending_changes)
VALUES 
  ('payables', NULL, 'never', 0),
  ('payable_payments', NULL, 'never', 0),
  ('receivables', NULL, 'never', 0),
  ('receivable_payments', NULL, 'never', 0);
