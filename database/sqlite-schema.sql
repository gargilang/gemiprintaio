-- SQLite Schema for app gemiprint aio (all in one) (Offline Database)
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

-- Master Kategori Barang
CREATE TABLE IF NOT EXISTS kategori_barang (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL UNIQUE,
  butuh_spesifikasi_status INTEGER DEFAULT 0, -- Flag: apakah kategori ini perlu quick specs
  urutan_tampilan INTEGER DEFAULT 0,
  dibuat_pada TEXT DEFAULT (datetime('now')),
  diperbarui_pada TEXT DEFAULT (datetime('now'))
);

-- Master Subkategori Barang
CREATE TABLE IF NOT EXISTS subkategori_barang (
  id TEXT PRIMARY KEY,
  kategori_id TEXT NOT NULL,
  nama TEXT NOT NULL,
  urutan_tampilan INTEGER DEFAULT 0,
  dibuat_pada TEXT DEFAULT (datetime('now')),
  diperbarui_pada TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (kategori_id) REFERENCES kategori_barang(id) ON DELETE CASCADE
);

-- Master Satuan Barang
CREATE TABLE IF NOT EXISTS satuan_barang (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL UNIQUE,
  urutan_tampilan INTEGER DEFAULT 0,
  dibuat_pada TEXT DEFAULT (datetime('now')),
  diperbarui_pada TEXT DEFAULT (datetime('now'))
);

-- Master Spesifikasi Cepat Barang (untuk Spek Cepat seperti ukuran kertas, gramasi, dll)
CREATE TABLE IF NOT EXISTS spesifikasi_cepat_barang (
  id TEXT PRIMARY KEY,
  kategori_id TEXT NOT NULL,
  tipe_spesifikasi TEXT NOT NULL, -- 'size', 'weight', 'width', 'thickness', dll
  nilai_spesifikasi TEXT NOT NULL,
  urutan_tampilan INTEGER DEFAULT 0,
  dibuat_pada TEXT DEFAULT (datetime('now')),
  diperbarui_pada TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (kategori_id) REFERENCES kategori_barang(id) ON DELETE CASCADE
);

-- Materials/Barang table (updated with category/subcategory references)
CREATE TABLE IF NOT EXISTS barang (
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
  FOREIGN KEY (kategori_id) REFERENCES kategori_barang(id) ON DELETE SET NULL,
  FOREIGN KEY (subkategori_id) REFERENCES subkategori_barang(id) ON DELETE SET NULL
);

-- Material Unit Prices (Multiple satuan dengan harga berbeda)
CREATE TABLE IF NOT EXISTS harga_barang_satuan (
  id TEXT PRIMARY KEY,
  barang_id TEXT NOT NULL,
  nama_satuan TEXT NOT NULL, -- pcs, lusin, pack, box, meter, roll, dll
  faktor_konversi REAL NOT NULL, -- Konversi ke satuan_dasar (contoh: 1 lusin = 12 pcs, maka faktor_konversi = 12)
  harga_beli REAL DEFAULT 0,
  harga_jual REAL DEFAULT 0,
  harga_member REAL DEFAULT 0,
  default_status INTEGER DEFAULT 0, -- Satuan default untuk transaksi
  urutan_tampilan INTEGER DEFAULT 0,
  dibuat_pada TEXT DEFAULT (datetime('now')),
  diperbarui_pada TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (barang_id) REFERENCES barang(id) ON DELETE CASCADE,
  UNIQUE(barang_id, nama_satuan)
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
  nomor_invoice TEXT UNIQUE NOT NULL,
  pelanggan_id TEXT,
  total_jumlah REAL NOT NULL,
  jumlah_dibayar REAL DEFAULT 0,
  jumlah_kembalian REAL DEFAULT 0,
  metode_pembayaran TEXT,
  kasir_id TEXT,
  catatan TEXT,
  dibuat_pada TEXT DEFAULT (datetime('now')),
  diperbarui_pada TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id),
  FOREIGN KEY (kasir_id) REFERENCES profil(id)
);

-- Sales Items
CREATE TABLE IF NOT EXISTS item_penjualan (
  id TEXT PRIMARY KEY,
  penjualan_id TEXT NOT NULL,
  barang_id TEXT NOT NULL,
  harga_satuan_id TEXT, -- Reference ke harga_barang_satuan untuk tahu satuan & harga yang dipakai
  jumlah REAL NOT NULL, -- Jumlah dalam satuan yang dipilih
  nama_satuan TEXT NOT NULL, -- Nama satuan yang digunakan (pcs, lusin, pack)
  faktor_konversi REAL NOT NULL, -- Konversi ke satuan_dasar untuk update stok
  harga_satuan REAL NOT NULL, -- Harga per satuan yang dipilih
  subtotal REAL NOT NULL,
  dibuat_pada TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (penjualan_id) REFERENCES penjualan(id) ON DELETE CASCADE,
  FOREIGN KEY (barang_id) REFERENCES barang(id),
  FOREIGN KEY (harga_satuan_id) REFERENCES harga_barang_satuan(id)
);

-- Purchase Orders
CREATE TABLE IF NOT EXISTS pembelian (
  id TEXT PRIMARY KEY,
  nomor_pembelian TEXT UNIQUE NOT NULL,
  vendor_id TEXT,
  total_jumlah REAL NOT NULL,
  jumlah_dibayar REAL DEFAULT 0,
  metode_pembayaran TEXT,
  catatan TEXT,
  dibuat_oleh TEXT,
  dibuat_pada TEXT DEFAULT (datetime('now')),
  diperbarui_pada TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (vendor_id) REFERENCES vendor(id),
  FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
);

-- Purchase Items
CREATE TABLE IF NOT EXISTS item_pembelian (
  id TEXT PRIMARY KEY,
  pembelian_id TEXT NOT NULL,
  barang_id TEXT NOT NULL,
  harga_satuan_id TEXT, -- Reference ke harga_barang_satuan
  jumlah REAL NOT NULL, -- Jumlah dalam satuan yang dipilih
  nama_satuan TEXT NOT NULL, -- Nama satuan yang digunakan
  faktor_konversi REAL NOT NULL, -- Konversi ke satuan_dasar
  harga_satuan REAL NOT NULL, -- Harga per satuan yang dipilih
  subtotal REAL NOT NULL,
  dibuat_pada TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (pembelian_id) REFERENCES pembelian(id) ON DELETE CASCADE,
  FOREIGN KEY (barang_id) REFERENCES barang(id),
  FOREIGN KEY (harga_satuan_id) REFERENCES harga_barang_satuan(id)
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
  pemilik_id TEXT NOT NULL,
  nama_layanan TEXT NOT NULL,
  nama_pengguna_akun TEXT NOT NULL,
  password_terenkripsi TEXT NOT NULL,
  catatan TEXT,
  privat_status INTEGER DEFAULT 1,
  dibuat_pada TEXT DEFAULT (datetime('now')),
  diperbarui_pada TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (pemilik_id) REFERENCES profil(id)
);
CREATE INDEX IF NOT EXISTS idx_credentials_owner ON kredensial(pemilik_id);
CREATE INDEX IF NOT EXISTS idx_credentials_service ON kredensial(nama_layanan);

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

