-- SQLite Schema for gemiprintaio (Offline Database)
-- This is equivalent to the PostgreSQL schema but adapted for SQLite

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Users/Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  -- Email kini opsional (nullable). UNIQUE di SQLite mengizinkan banyak NULL.
  email TEXT UNIQUE,
  full_name TEXT,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'manager', 'user')),
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Default admin user (username: gemi, password: 5555)
-- Password hash for "5555" using SHA-256
INSERT OR IGNORE INTO profiles (id, username, email, full_name, password_hash, role, is_active)
VALUES (
  'admin-gemi-001',
  'gemi',
  'admin@gemiprint.com',
  'Gemi Administrator',
  'c1f330d0aff31c1c87403f1e4347bcc21aff7c179908723535f2b31723702525',
  'admin',
  1
);

-- Master Material Categories
CREATE TABLE IF NOT EXISTS material_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  needs_specifications INTEGER DEFAULT 0, -- Flag: apakah kategori ini perlu quick specs
  display_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Master Material Subcategories
CREATE TABLE IF NOT EXISTS material_subcategories (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES material_categories(id) ON DELETE CASCADE
);

-- Master Material Units (Satuan)
CREATE TABLE IF NOT EXISTS material_units (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Master Quick Specs (untuk Spek Cepat seperti ukuran kertas, gramasi, dll)
CREATE TABLE IF NOT EXISTS material_quick_specs (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  spec_type TEXT NOT NULL, -- 'size', 'weight', 'width', 'thickness', dll
  spec_value TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES material_categories(id) ON DELETE CASCADE
);

-- Default Material Categories
INSERT OR IGNORE INTO material_categories (id, name, needs_specifications, display_order) VALUES
  ('cat-media-cetak', 'Media Cetak', 0, 1),
  ('cat-kertas', 'Kertas', 1, 2),
  ('cat-kertas-foto', 'Kertas Foto', 1, 3),
  ('cat-merchandise', 'Merchandise', 0, 4),
  ('cat-substrat-uv', 'Substrat UV', 0, 5),
  ('cat-tinta-consumables', 'Tinta & Consumables', 0, 6),
  ('cat-finishing', 'Finishing', 1, 7),
  ('cat-lain-lain', 'Lain-lain', 0, 8);

-- Default Subcategories for Media Cetak
INSERT OR IGNORE INTO material_subcategories (id, category_id, name, display_order) VALUES
  ('sub-mc-flexi', 'cat-media-cetak', 'Flexi/Banner', 1),
  ('sub-mc-vinyl', 'cat-media-cetak', 'Vinyl', 2),
  ('sub-mc-sticker', 'cat-media-cetak', 'Sticker', 3),
  ('sub-mc-backlit', 'cat-media-cetak', 'Backlit', 4),
  ('sub-mc-owv', 'cat-media-cetak', 'One Way Vision', 5),
  ('sub-mc-albatross', 'cat-media-cetak', 'Albatross', 6),
  ('sub-mc-canvas', 'cat-media-cetak', 'Canvas', 7),
  ('sub-mc-lainlain', 'cat-media-cetak', 'Lain-lain', 99);

-- Default Subcategories for Kertas
INSERT OR IGNORE INTO material_subcategories (id, category_id, name, display_order) VALUES
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
INSERT OR IGNORE INTO material_subcategories (id, category_id, name, display_order) VALUES
  ('sub-kf-glossy', 'cat-kertas-foto', 'Photo Paper Glossy', 1),
  ('sub-kf-matte', 'cat-kertas-foto', 'Photo Paper Matte', 2),
  ('sub-kf-luster', 'cat-kertas-foto', 'Photo Paper Luster', 3),
  ('sub-kf-rc', 'cat-kertas-foto', 'RC Paper', 4),
  ('sub-kf-inkjet', 'cat-kertas-foto', 'Inkjet Paper', 5);

-- Default Subcategories for Merchandise
INSERT OR IGNORE INTO material_subcategories (id, category_id, name, display_order) VALUES
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
INSERT OR IGNORE INTO material_subcategories (id, category_id, name, display_order) VALUES
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
INSERT OR IGNORE INTO material_subcategories (id, category_id, name, display_order) VALUES
  ('sub-tc-eco', 'cat-tinta-consumables', 'Tinta Eco Solvent', 1),
  ('sub-tc-uv', 'cat-tinta-consumables', 'Tinta UV', 2),
  ('sub-tc-sublim', 'cat-tinta-consumables', 'Tinta Sublim', 3),
  ('sub-tc-pigment', 'cat-tinta-consumables', 'Tinta Pigment', 4),
  ('sub-tc-dye', 'cat-tinta-consumables', 'Tinta Dye', 5),
  ('sub-tc-cleaning', 'cat-tinta-consumables', 'Cleaning Solution', 6),
  ('sub-tc-lainlain', 'cat-tinta-consumables', 'Lain-lain', 99);

-- Default Subcategories for Finishing
INSERT OR IGNORE INTO material_subcategories (id, category_id, name, display_order) VALUES
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
INSERT OR IGNORE INTO material_subcategories (id, category_id, name, display_order) VALUES
  ('sub-ll-umum', 'cat-lain-lain', 'Umum', 1);

-- Default Material Units
INSERT OR IGNORE INTO material_units (id, name, display_order) VALUES
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
INSERT OR IGNORE INTO material_quick_specs (id, category_id, spec_type, spec_value, display_order) VALUES
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
INSERT OR IGNORE INTO material_quick_specs (id, category_id, spec_type, spec_value, display_order) VALUES
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
INSERT OR IGNORE INTO material_quick_specs (id, category_id, spec_type, spec_value, display_order)
SELECT 
  REPLACE(id, 'cat-kertas', 'cat-kertas-foto'),
  'cat-kertas-foto',
  spec_type,
  spec_value,
  display_order
FROM material_quick_specs WHERE category_id = 'cat-kertas';

-- Materials/Bahan table (updated with category/subcategory references)
CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category_id TEXT,
  subcategory_id TEXT,
  base_unit TEXT NOT NULL, -- Satuan terkecil untuk tracking stok (pcs, meter, lembar, dll)
  specifications TEXT,
  stock_quantity REAL DEFAULT 0, -- Stok dalam satuan base_unit
  min_stock_level REAL DEFAULT 0,
  track_inventory INTEGER DEFAULT 1, -- 1 = track stok, 0 = tidak perlu track (contoh: lem, minyak goreng, tinta)
  requires_dimension INTEGER DEFAULT 0, -- 1 = perlu input P×L di POS (banner, vinyl, flexi), 0 = input qty biasa
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES material_categories(id) ON DELETE SET NULL,
  FOREIGN KEY (subcategory_id) REFERENCES material_subcategories(id) ON DELETE SET NULL
);

-- Material Unit Prices (Multiple satuan dengan harga berbeda)
CREATE TABLE IF NOT EXISTS material_unit_prices (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL,
  unit_name TEXT NOT NULL, -- pcs, lusin, pack, box, meter, roll, dll
  conversion_factor REAL NOT NULL, -- Konversi ke base_unit (contoh: 1 lusin = 12 pcs, maka conversion_factor = 12)
  purchase_price REAL DEFAULT 0,
  selling_price REAL DEFAULT 0,
  member_price REAL DEFAULT 0,
  is_default INTEGER DEFAULT 0, -- Satuan default untuk transaksi
  display_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
  UNIQUE(material_id, unit_name)
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  tipe_pelanggan TEXT NOT NULL CHECK(tipe_pelanggan IN ('perorangan', 'perusahaan')),
  name TEXT NOT NULL,
  company_name TEXT,
  tax_id TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  is_member INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Vendors table
CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  contact_person TEXT,
  payment_terms TEXT,
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Sales/POS Transactions
CREATE TABLE IF NOT EXISTS sales (
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
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (cashier_id) REFERENCES profiles(id)
);

-- Sales Items
CREATE TABLE IF NOT EXISTS sales_items (
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
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id),
  FOREIGN KEY (unit_price_id) REFERENCES material_unit_prices(id)
);

-- Purchase Orders
CREATE TABLE IF NOT EXISTS purchases (
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
  FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  FOREIGN KEY (created_by) REFERENCES profiles(id)
);

-- Purchase Items
CREATE TABLE IF NOT EXISTS purchase_items (
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
  FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id),
  FOREIGN KEY (unit_price_id) REFERENCES material_unit_prices(id)
);

-- Financial Transactions
CREATE TABLE IF NOT EXISTS financial_transactions (
  id TEXT PRIMARY KEY,
  kategori_transaksi TEXT NOT NULL CHECK(kategori_transaksi IN (
    'KAS', 'BIAYA', 'OMZET', 'INVESTOR', 'SUBSIDI', 'LUNAS', 
    'SUPPLY', 'LABA', 'KOMISI', 'TABUNGAN', 'HUTANG', 'PIUTANG', 
    'PRIBADI-A', 'PRIBADI-S'
  )),
  reference_type TEXT,
  reference_id TEXT,
  customer_id TEXT,
  vendor_id TEXT,
  employee_id TEXT,
  amount REAL NOT NULL,
  description TEXT NOT NULL,
  is_paid INTEGER DEFAULT 0,
  payment_date TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  FOREIGN KEY (employee_id) REFERENCES profiles(id),
  FOREIGN KEY (created_by) REFERENCES profiles(id)
);

-- Other Transactions
CREATE TABLE IF NOT EXISTS other_transactions (
  id TEXT PRIMARY KEY,
  kategori_transaksi TEXT NOT NULL CHECK(kategori_transaksi IN (
    'KAS', 'BIAYA', 'OMZET', 'INVESTOR', 'SUBSIDI', 'LUNAS', 
    'SUPPLY', 'LABA', 'KOMISI', 'TABUNGAN', 'HUTANG', 'PIUTANG', 
    'PRIBADI-A', 'PRIBADI-S'
  )),
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT NOT NULL,
  transaction_date TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES profiles(id)
);

-- =====================================================
-- SISTEM KEUANGAN TERPISAH (Independent Finance System)
-- =====================================================

-- Tabel Karyawan untuk Kasbon dan Bagi Hasil
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position TEXT,
  phone TEXT,
  address TEXT,
  join_date TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Tabel Buku Kas (Cash Book) - Manual Input
CREATE TABLE IF NOT EXISTS cash_book (
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
  
  notes TEXT,
  created_by TEXT,
  
  -- Archive fields
  archived_at TEXT,
  archived_label TEXT,
  
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES profiles(id)
);

-- Tabel Kasbon (Employee Cash Advance)
CREATE TABLE IF NOT EXISTS kasbon (
  id TEXT PRIMARY KEY,
  employee_name TEXT NOT NULL,
  amount REAL NOT NULL,
  tanggal_kasbon TEXT NOT NULL,
  tanggal_bayar TEXT,
  status TEXT DEFAULT 'belum_lunas' CHECK(status IN ('belum_lunas', 'lunas', 'sebagian')),
  sisa_hutang REAL,
  keterangan TEXT,
  cash_book_id TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (cash_book_id) REFERENCES cash_book(id),
  FOREIGN KEY (created_by) REFERENCES profiles(id)
);

-- Tabel Pembayaran Kasbon (Kasbon Payment History)
CREATE TABLE IF NOT EXISTS kasbon_payments (
  id TEXT PRIMARY KEY,
  kasbon_id TEXT NOT NULL,
  amount_paid REAL NOT NULL,
  tanggal_bayar TEXT NOT NULL,
  payment_method TEXT,
  notes TEXT,
  cash_book_id TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (kasbon_id) REFERENCES kasbon(id) ON DELETE CASCADE,
  FOREIGN KEY (cash_book_id) REFERENCES cash_book(id),
  FOREIGN KEY (created_by) REFERENCES profiles(id)
);

-- Tabel Bagi Hasil (Profit Sharing)
CREATE TABLE IF NOT EXISTS bagi_hasil (
  id TEXT PRIMARY KEY,
  periode_bulan TEXT NOT NULL, -- Format: YYYY-MM
  total_laba REAL NOT NULL,
  persentase_anwar REAL DEFAULT 0,
  persentase_suri REAL DEFAULT 0,
  persentase_gemi REAL DEFAULT 0,
  jumlah_anwar REAL DEFAULT 0,
  jumlah_suri REAL DEFAULT 0,
  jumlah_gemi REAL DEFAULT 0,
  tanggal_bagi TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid')),
  notes TEXT,
  cash_book_id TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (cash_book_id) REFERENCES cash_book(id),
  FOREIGN KEY (created_by) REFERENCES profiles(id)
);

-- Tabel Kategori Biaya (Expense Categories)
CREATE TABLE IF NOT EXISTS expense_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Tabel Laporan Keuangan Bulanan (Monthly Financial Report Summary)
CREATE TABLE IF NOT EXISTS monthly_financial_reports (
  id TEXT PRIMARY KEY,
  periode_bulan TEXT NOT NULL UNIQUE, -- Format: YYYY-MM
  total_omzet REAL DEFAULT 0,
  total_biaya_operasional REAL DEFAULT 0,
  total_biaya_bahan REAL DEFAULT 0,
  total_debit REAL DEFAULT 0,
  total_kredit REAL DEFAULT 0,
  saldo_awal REAL DEFAULT 0,
  saldo_akhir REAL DEFAULT 0,
  laba_bersih REAL DEFAULT 0,
  total_kasbon_outstanding REAL DEFAULT 0,
  total_bagi_hasil REAL DEFAULT 0,
  generated_at TEXT DEFAULT (datetime('now')),
  notes TEXT
);

-- Inventory Movements
CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK(movement_type IN ('in', 'out', 'adjustment')),
  quantity REAL NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (material_id) REFERENCES materials(id),
  FOREIGN KEY (created_by) REFERENCES profiles(id)
);

-- Sync Metadata Table (untuk tracking sync status)
CREATE TABLE IF NOT EXISTS sync_metadata (
  table_name TEXT PRIMARY KEY,
  last_sync_at TEXT,
  last_sync_status TEXT,
  pending_changes INTEGER DEFAULT 0
);

-- Sync Queue Table (untuk tracking perubahan yang belum di-sync)
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('INSERT', 'UPDATE', 'DELETE')),
  data TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  synced INTEGER DEFAULT 0,
  sync_attempts INTEGER DEFAULT 0,
  last_error TEXT
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
CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  account_username TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  notes TEXT,
  is_private INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_credentials_owner ON credentials(owner_id);
CREATE INDEX IF NOT EXISTS idx_credentials_service ON credentials(service_name);

-- Indexes untuk sistem keuangan
CREATE INDEX IF NOT EXISTS idx_cash_book_tanggal ON cash_book(tanggal);
CREATE INDEX IF NOT EXISTS idx_cash_book_kategori ON cash_book(kategori_transaksi);
CREATE INDEX IF NOT EXISTS idx_kasbon_employee ON kasbon(employee_name);
CREATE INDEX IF NOT EXISTS idx_kasbon_status ON kasbon(status);
CREATE INDEX IF NOT EXISTS idx_kasbon_tanggal ON kasbon(tanggal_kasbon);
CREATE INDEX IF NOT EXISTS idx_kasbon_payments_kasbon ON kasbon_payments(kasbon_id);
CREATE INDEX IF NOT EXISTS idx_bagi_hasil_periode ON bagi_hasil(periode_bulan);
CREATE INDEX IF NOT EXISTS idx_bagi_hasil_status ON bagi_hasil(status);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_periode ON monthly_financial_reports(periode_bulan);
CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name);
CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(is_active);

-- Triggers for updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_profiles_timestamp 
  AFTER UPDATE ON profiles
  BEGIN
    UPDATE profiles SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_materials_timestamp 
  AFTER UPDATE ON materials
  BEGIN
    UPDATE materials SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_customers_timestamp 
  AFTER UPDATE ON customers
  BEGIN
    UPDATE customers SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_vendors_timestamp 
  AFTER UPDATE ON vendors
  BEGIN
    UPDATE vendors SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_sales_timestamp 
  AFTER UPDATE ON sales
  BEGIN
    UPDATE sales SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_purchases_timestamp 
  AFTER UPDATE ON purchases
  BEGIN
    UPDATE purchases SET updated_at = datetime('now') WHERE id = NEW.id;
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
CREATE TRIGGER IF NOT EXISTS update_cash_book_timestamp 
  AFTER UPDATE ON cash_book
  BEGIN
    UPDATE cash_book SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_employees_timestamp 
  AFTER UPDATE ON employees
  BEGIN
    UPDATE employees SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_kasbon_timestamp 
  AFTER UPDATE ON kasbon
  BEGIN
    UPDATE kasbon SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_bagi_hasil_timestamp 
  AFTER UPDATE ON bagi_hasil
  BEGIN
    UPDATE bagi_hasil SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_expense_categories_timestamp 
  AFTER UPDATE ON expense_categories
  BEGIN
    UPDATE expense_categories SET updated_at = datetime('now') WHERE id = NEW.id;
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
  ('cash_book', NULL, 'never', 0),
  ('kasbon', NULL, 'never', 0),
  ('kasbon_payments', NULL, 'never', 0),
  ('bagi_hasil', NULL, 'never', 0),
  ('employees', NULL, 'never', 0),
  ('expense_categories', NULL, 'never', 0),
  ('monthly_financial_reports', NULL, 'never', 0);

-- Insert default expense categories
INSERT OR IGNORE INTO expense_categories (id, name, description)
VALUES 
  ('exp_001', 'Gaji Karyawan', 'Pembayaran gaji bulanan karyawan'),
  ('exp_002', 'Listrik & Air', 'Biaya utilitas bulanan'),
  ('exp_003', 'Sewa Tempat', 'Biaya sewa gedung/tempat usaha'),
  ('exp_004', 'Transportasi', 'Biaya transportasi dan pengiriman'),
  ('exp_005', 'Maintenance', 'Biaya pemeliharaan peralatan'),
  ('exp_006', 'ATK & Supplies', 'Alat tulis kantor dan perlengkapan'),
  ('exp_007', 'Marketing', 'Biaya promosi dan iklan'),
  ('exp_008', 'Komunikasi', 'Biaya telepon dan internet'),
  ('exp_009', 'Lain-lain', 'Biaya operasional lainnya');

-- Insert default employees (Anwar, Suri, Cahaya, Dinil, Gemi)
INSERT OR IGNORE INTO employees (id, name, position, is_active)
VALUES 
  ('emp_anwar', 'Anwar', 'Partner', 1),
  ('emp_suri', 'Suri', 'Partner', 1),
  ('emp_gemi', 'Gemi', 'Owner', 1),
  ('emp_cahaya', 'Cahaya', 'Staff', 1),
  ('emp_dinil', 'Dinil', 'Staff', 1);

-- =====================================================
-- HUTANG & PIUTANG SYSTEM
-- =====================================================

-- Tabel Hutang (Payables) - Hutang ke Vendor dari Pembelian
CREATE TABLE IF NOT EXISTS payables (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL,
  purchase_id TEXT, -- Link ke transaksi pembelian (nullable untuk hutang manual)
  invoice_number TEXT NOT NULL, -- Nomor faktur/nota dari vendor
  invoice_date TEXT NOT NULL,
  total_amount REAL NOT NULL,
  paid_amount REAL DEFAULT 0,
  remaining_amount REAL NOT NULL,
  due_date TEXT,
  status TEXT DEFAULT 'unpaid' CHECK(status IN ('unpaid', 'partial', 'paid')),
  notes TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT,
  FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES profiles(id)
);

-- Tabel Pembayaran Hutang (Payable Payments)
CREATE TABLE IF NOT EXISTS payable_payments (
  id TEXT PRIMARY KEY,
  payable_id TEXT NOT NULL,
  payment_date TEXT NOT NULL,
  amount_paid REAL NOT NULL,
  payment_method TEXT, -- 'cash', 'transfer', 'check', dll
  reference_number TEXT, -- No. transfer/check
  notes TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (payable_id) REFERENCES payables(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES profiles(id)
);

-- Tabel Piutang (Receivables) - Piutang dari Customer
CREATE TABLE IF NOT EXISTS receivables (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  sale_id TEXT, -- Link ke transaksi penjualan (nullable untuk piutang manual)
  invoice_number TEXT NOT NULL, -- Nomor invoice kita
  invoice_date TEXT NOT NULL,
  total_amount REAL NOT NULL,
  paid_amount REAL DEFAULT 0,
  remaining_amount REAL NOT NULL,
  due_date TEXT,
  status TEXT DEFAULT 'unpaid' CHECK(status IN ('unpaid', 'partial', 'paid')),
  notes TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES profiles(id)
);

-- Tabel Pembayaran Piutang (Receivable Payments)
CREATE TABLE IF NOT EXISTS receivable_payments (
  id TEXT PRIMARY KEY,
  receivable_id TEXT NOT NULL,
  payment_date TEXT NOT NULL,
  amount_paid REAL NOT NULL,
  payment_method TEXT, -- 'cash', 'transfer', 'check', dll
  reference_number TEXT, -- No. transfer/check
  notes TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (receivable_id) REFERENCES receivables(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES profiles(id)
);

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
