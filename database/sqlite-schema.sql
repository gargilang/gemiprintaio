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

-- Materials/Bahan table
CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL,
  purchase_price REAL DEFAULT 0,
  selling_price REAL DEFAULT 0,
  member_price REAL DEFAULT 0,
  stock_quantity REAL DEFAULT 0,
  min_stock_level REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
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
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  subtotal REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id)
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
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  subtotal REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id)
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

