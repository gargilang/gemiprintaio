-- EXTRACTED SCHEMA FROM DATABASE
-- Generated: 2025-11-13T16:34:36.686Z
-- Database: gemiprint.db
--
-- This schema includes sync tracking columns:
-- - sync_status: 'pending' | 'synced' | 'conflict'
-- - last_synced_at: timestamp of last successful sync
-- - sync_version: integer version for conflict resolution
--

-- Table: barang
CREATE TABLE barang (
      id TEXT PRIMARY KEY,
      nama TEXT NOT NULL,
      deskripsi TEXT,
      kategori_id TEXT,
      subkategori_id TEXT,
      satuan_dasar TEXT NOT NULL,
      spesifikasi TEXT,
      jumlah_stok REAL DEFAULT 0,
      level_stok_minimum REAL DEFAULT 0,
      lacak_inventori_status INTEGER DEFAULT 1,
      butuh_dimensi_status INTEGER DEFAULT 0,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')), frekuensi_terjual INTEGER DEFAULT 0, sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (kategori_id) REFERENCES kategori_barang(id) ON DELETE SET NULL,
      FOREIGN KEY (subkategori_id) REFERENCES subkategori_barang(id) ON DELETE SET NULL
    );

-- Indexes for barang
CREATE INDEX idx_barang_sync_status ON barang(sync_status);

-- Table: harga_barang_satuan
CREATE TABLE "harga_barang_satuan" (
        id TEXT PRIMARY KEY,
        barang_id TEXT NOT NULL,
        nama_satuan TEXT NOT NULL,
        faktor_konversi REAL NOT NULL,
        harga_beli REAL DEFAULT 0,
        harga_jual REAL DEFAULT 0,
        harga_member REAL DEFAULT 0,
        default_status INTEGER DEFAULT 0,
        urutan_tampilan INTEGER DEFAULT 0,
        dibuat_pada TEXT DEFAULT (datetime('now')),
        diperbarui_pada TEXT DEFAULT (datetime('now')), sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
        FOREIGN KEY (barang_id) REFERENCES "barang"(id) ON DELETE CASCADE,
        UNIQUE(barang_id, nama_satuan)
      );

-- Indexes for harga_barang_satuan
CREATE INDEX idx_harga_barang_satuan_sync_status ON harga_barang_satuan(sync_status);

-- Table: hutang_pembelian
CREATE TABLE hutang_pembelian (
      id TEXT PRIMARY KEY,
      id_pembelian TEXT NOT NULL,
      jumlah_hutang REAL NOT NULL,
      jumlah_terbayar REAL DEFAULT 0,
      sisa_hutang REAL NOT NULL,
      jatuh_tempo TEXT,
      status TEXT DEFAULT 'AKTIF' CHECK(status IN ('AKTIF', 'LUNAS', 'JATUH_TEMPO')),
      catatan TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')), sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (id_pembelian) REFERENCES pembelian(id) ON DELETE CASCADE
    );

-- Indexes for hutang_pembelian
CREATE INDEX idx_hutang_pembelian_sync_status ON hutang_pembelian(sync_status);

-- Table: item_finishing
CREATE TABLE item_finishing (
      id TEXT PRIMARY KEY,
      item_produksi_id TEXT NOT NULL,
      jenis_finishing TEXT NOT NULL,
      keterangan TEXT,
      status TEXT DEFAULT 'MENUNGGU' CHECK(status IN ('MENUNGGU', 'PROSES', 'SELESAI')),
      operator_id TEXT,
      mulai_proses TEXT,
      selesai_proses TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')), sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (item_produksi_id) REFERENCES item_produksi(id) ON DELETE CASCADE,
      FOREIGN KEY (operator_id) REFERENCES profil(id)
    );

-- Indexes for item_finishing
CREATE INDEX idx_item_finishing_item ON item_finishing(item_produksi_id);
CREATE INDEX idx_item_finishing_sync_status ON item_finishing(sync_status);

-- Table: item_pembelian
CREATE TABLE item_pembelian (
      id TEXT PRIMARY KEY,
      pembelian_id TEXT NOT NULL,
      barang_id TEXT NOT NULL,
      harga_satuan_id TEXT,
      jumlah REAL NOT NULL,
      nama_satuan TEXT NOT NULL,
      faktor_konversi REAL NOT NULL,
      harga_satuan REAL NOT NULL,
      subtotal REAL NOT NULL,
      dibuat_pada TEXT DEFAULT (datetime('now')), sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (pembelian_id) REFERENCES pembelian(id) ON DELETE CASCADE,
      FOREIGN KEY (barang_id) REFERENCES "barang"(id),
      FOREIGN KEY (harga_satuan_id) REFERENCES "harga_barang_satuan"(id)
    );

-- Indexes for item_pembelian
CREATE INDEX idx_item_pembelian_sync_status ON item_pembelian(sync_status);

-- Table: item_penjualan
CREATE TABLE item_penjualan (
      id TEXT PRIMARY KEY,
      penjualan_id TEXT NOT NULL,
      barang_id TEXT NOT NULL,
      harga_satuan_id TEXT,
      jumlah REAL NOT NULL,
      nama_satuan TEXT NOT NULL,
      faktor_konversi REAL NOT NULL,
      harga_satuan REAL NOT NULL,
      subtotal REAL NOT NULL,
      dibuat_pada TEXT DEFAULT (datetime('now')), sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (penjualan_id) REFERENCES penjualan(id) ON DELETE CASCADE,
      FOREIGN KEY (barang_id) REFERENCES "barang"(id),
      FOREIGN KEY (harga_satuan_id) REFERENCES "harga_barang_satuan"(id)
    );

-- Indexes for item_penjualan
CREATE INDEX idx_item_penjualan_sync_status ON item_penjualan(sync_status);

-- Table: item_produksi
CREATE TABLE item_produksi (
      id TEXT PRIMARY KEY,
      order_produksi_id TEXT NOT NULL,
      item_penjualan_id TEXT NOT NULL,
      barang_nama TEXT NOT NULL,
      jumlah REAL NOT NULL,
      nama_satuan TEXT NOT NULL,
      panjang REAL,
      lebar REAL,
      keterangan_dimensi TEXT,
      mesin_printing TEXT,
      jenis_bahan TEXT,
      status TEXT DEFAULT 'MENUNGGU' CHECK(status IN ('MENUNGGU', 'PRINTING', 'FINISHING', 'SELESAI')),
      catatan_produksi TEXT,
      operator_id TEXT,
      mulai_proses TEXT,
      selesai_proses TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')), sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (order_produksi_id) REFERENCES order_produksi(id) ON DELETE CASCADE,
      FOREIGN KEY (item_penjualan_id) REFERENCES item_penjualan(id) ON DELETE CASCADE,
      FOREIGN KEY (operator_id) REFERENCES profil(id)
    );

-- Indexes for item_produksi
CREATE INDEX idx_item_produksi_order ON item_produksi(order_produksi_id);
CREATE INDEX idx_item_produksi_status ON item_produksi(status);
CREATE INDEX idx_item_produksi_sync_status ON item_produksi(sync_status);

-- Table: kategori_barang
CREATE TABLE "kategori_barang" (
      id TEXT PRIMARY KEY,
      nama TEXT NOT NULL UNIQUE,
      butuh_spesifikasi_status INTEGER DEFAULT 0,
      urutan_tampilan INTEGER DEFAULT 0,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now'))
    , sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1);

-- Indexes for kategori_barang
CREATE INDEX idx_kategori_bahan_nama ON "kategori_barang"(nama);
CREATE INDEX idx_kategori_barang_sync_status ON kategori_barang(sync_status);

-- Table: keuangan
CREATE TABLE keuangan (
      id TEXT PRIMARY KEY,
      tanggal TEXT NOT NULL,
      kategori_transaksi TEXT NOT NULL,
      debit REAL DEFAULT 0,
      kredit REAL DEFAULT 0,
      keperluan TEXT,
      omzet REAL DEFAULT 0,
      biaya_operasional REAL DEFAULT 0,
      biaya_bahan REAL DEFAULT 0,
      saldo REAL DEFAULT 0,
      laba_bersih REAL DEFAULT 0,
      kasbon_anwar REAL DEFAULT 0,
      kasbon_suri REAL DEFAULT 0,
      kasbon_cahaya REAL DEFAULT 0,
      kasbon_dinil REAL DEFAULT 0,
      bagi_hasil_anwar REAL DEFAULT 0,
      bagi_hasil_suri REAL DEFAULT 0,
      bagi_hasil_gemi REAL DEFAULT 0,
      catatan TEXT,
      dibuat_oleh TEXT,
      diarsipkan_pada TEXT,
      label_arsip TEXT,
      dibuat_pada TEXT NOT NULL,
      diperbarui_pada TEXT NOT NULL,
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
      override_bagi_hasil_gemi INTEGER DEFAULT 0
    , sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1);

-- Indexes for keuangan
CREATE INDEX idx_keuangan_sync_status ON keuangan(sync_status);

-- Table: kredensial
CREATE TABLE "kredensial" (
        id TEXT PRIMARY KEY,
        pemilik_id TEXT NOT NULL,
        nama_layanan TEXT NOT NULL,
        nama_pengguna_akun TEXT NOT NULL,
        password_terenkripsi TEXT NOT NULL,
        catatan TEXT,
        privat_status INTEGER DEFAULT 1,
        dibuat_pada TEXT DEFAULT (datetime('now')),
        diperbarui_pada TEXT DEFAULT (datetime('now')), sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
        FOREIGN KEY (pemilik_id) REFERENCES profil(id)
      );

-- Indexes for kredensial
CREATE INDEX idx_credentials_owner ON kredensial(pemilik_id);
CREATE INDEX idx_credentials_service ON kredensial(nama_layanan);
CREATE INDEX idx_kredensial_sync_status ON kredensial(sync_status);

-- Table: opsi_finishing
CREATE TABLE opsi_finishing (
      id TEXT PRIMARY KEY,
      nama TEXT NOT NULL UNIQUE,
      urutan_tampilan INTEGER DEFAULT 0,
      aktif_status INTEGER DEFAULT 1,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now'))
    , sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1);

-- Indexes for opsi_finishing
CREATE INDEX idx_opsi_finishing_aktif ON opsi_finishing(aktif_status, urutan_tampilan);
CREATE INDEX idx_opsi_finishing_sync_status ON opsi_finishing(sync_status);

-- Table: order_produksi
CREATE TABLE order_produksi (
      id TEXT PRIMARY KEY,
      penjualan_id TEXT NOT NULL,
      nomor_spk TEXT UNIQUE NOT NULL,
      pelanggan_nama TEXT,
      total_item INTEGER DEFAULT 0,
      status TEXT DEFAULT 'MENUNGGU' CHECK(status IN ('MENUNGGU', 'PROSES', 'SELESAI', 'DIBATALKAN')),
      prioritas TEXT DEFAULT 'NORMAL' CHECK(prioritas IN ('RENDAH', 'NORMAL', 'TINGGI', 'MENDESAK')),
      tanggal_deadline TEXT,
      catatan TEXT,
      dibuat_oleh TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      diselesaikan_pada TEXT, sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (penjualan_id) REFERENCES penjualan(id) ON DELETE CASCADE,
      FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
    );

-- Indexes for order_produksi
CREATE INDEX idx_order_produksi_status ON order_produksi(status);
CREATE INDEX idx_order_produksi_penjualan ON order_produksi(penjualan_id);
CREATE INDEX idx_order_produksi_sync_status ON order_produksi(sync_status);

-- Table: pelanggan
CREATE TABLE "pelanggan" (
      id TEXT PRIMARY KEY,
      tipe_pelanggan TEXT,
      nama TEXT NOT NULL,
      nama_perusahaan TEXT,
      npwp TEXT,
      email TEXT,
      telepon TEXT,
      alamat TEXT,
      member_status INTEGER DEFAULT 0,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now'))
    , sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1);

-- Indexes for pelanggan
CREATE INDEX idx_pelanggan_sync_status ON pelanggan(sync_status);

-- Table: pelunasan_hutang
CREATE TABLE pelunasan_hutang (
      id TEXT PRIMARY KEY,
      id_hutang TEXT NOT NULL,
      tanggal_bayar TEXT NOT NULL,
      jumlah_bayar REAL NOT NULL,
      metode_pembayaran TEXT DEFAULT 'CASH',
      referensi TEXT,
      catatan TEXT,
      dibuat_oleh TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')), sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (id_hutang) REFERENCES hutang_pembelian(id) ON DELETE CASCADE,
      FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
    );

-- Indexes for pelunasan_hutang
CREATE INDEX idx_pelunasan_hutang_sync_status ON pelunasan_hutang(sync_status);

-- Table: pelunasan_piutang
CREATE TABLE pelunasan_piutang (
      id TEXT PRIMARY KEY,
      id_piutang TEXT NOT NULL,
      tanggal_bayar TEXT NOT NULL,
      jumlah_bayar REAL NOT NULL,
      metode_pembayaran TEXT DEFAULT 'CASH',
      referensi TEXT,
      catatan TEXT,
      dibuat_oleh TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')), sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (id_piutang) REFERENCES piutang_penjualan(id) ON DELETE CASCADE,
      FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
    );

-- Indexes for pelunasan_piutang
CREATE INDEX idx_pelunasan_piutang_date ON pelunasan_piutang(tanggal_bayar);
CREATE INDEX idx_pelunasan_piutang_sync_status ON pelunasan_piutang(sync_status);

-- Table: pembelian
CREATE TABLE pembelian (
      id TEXT PRIMARY KEY,
      nomor_pembelian TEXT UNIQUE NOT NULL,
      vendor_id TEXT,
      total_jumlah REAL NOT NULL,
      jumlah_dibayar REAL DEFAULT 0,
      metode_pembayaran TEXT,
      catatan TEXT,
      dibuat_oleh TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')), tanggal TEXT DEFAULT (date('now')), nomor_faktur TEXT, status_pembayaran TEXT DEFAULT 'LUNAS' 
      CHECK(status_pembayaran IN ('LUNAS', 'HUTANG', 'SEBAGIAN')), sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (vendor_id) REFERENCES vendor(id),
      FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
    );

-- Indexes for pembelian
CREATE INDEX idx_pembelian_sync_status ON pembelian(sync_status);

-- Table: penjualan
CREATE TABLE penjualan (
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
      diperbarui_pada TEXT DEFAULT (datetime('now')), sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id),
      FOREIGN KEY (kasir_id) REFERENCES profil(id)
    );

-- Indexes for penjualan
CREATE INDEX idx_penjualan_sync_status ON penjualan(sync_status);

-- Table: piutang_penjualan
CREATE TABLE piutang_penjualan (
      id TEXT PRIMARY KEY,
      id_penjualan TEXT NOT NULL,
      jumlah_piutang REAL NOT NULL,
      jumlah_terbayar REAL DEFAULT 0,
      sisa_piutang REAL NOT NULL,
      jatuh_tempo TEXT,
      status TEXT DEFAULT 'AKTIF' CHECK(status IN ('AKTIF', 'LUNAS', 'JATUH_TEMPO', 'SEBAGIAN')),
      catatan TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')), sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (id_penjualan) REFERENCES penjualan(id) ON DELETE CASCADE
    );

-- Indexes for piutang_penjualan
CREATE INDEX idx_piutang_penjualan_status ON piutang_penjualan(status);
CREATE INDEX idx_piutang_penjualan_date ON piutang_penjualan(dibuat_pada);
CREATE INDEX idx_piutang_penjualan_sync_status ON piutang_penjualan(sync_status);

-- Table: profil
CREATE TABLE "profil" (
      id TEXT PRIMARY KEY,
      nama_pengguna TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      nama_lengkap TEXT,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'manager', 'chief', 'user')),
      aktif_status INTEGER DEFAULT 1,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now'))
    , sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1);

-- Indexes for profil
CREATE INDEX idx_profil_sync_status ON profil(sync_status);

-- Table: satuan_barang
CREATE TABLE "satuan_barang" (
      id TEXT PRIMARY KEY,
      nama TEXT NOT NULL UNIQUE,
      urutan_tampilan INTEGER DEFAULT 0,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now'))
    , sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1);

-- Indexes for satuan_barang
CREATE INDEX idx_satuan_bahan_nama ON "satuan_barang"(nama);
CREATE INDEX idx_satuan_barang_sync_status ON satuan_barang(sync_status);

-- Table: spesifikasi_cepat_barang
CREATE TABLE "spesifikasi_cepat_barang" (
      id TEXT PRIMARY KEY,
      kategori_id TEXT NOT NULL,
      tipe_spesifikasi TEXT NOT NULL,
      nilai_spesifikasi TEXT NOT NULL,
      urutan_tampilan INTEGER DEFAULT 0,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')), sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (kategori_id) REFERENCES "kategori_barang"(id) ON DELETE CASCADE
    );

-- Indexes for spesifikasi_cepat_barang
CREATE INDEX idx_spesifikasi_cepat_kategori ON "spesifikasi_cepat_barang"(kategori_id);
CREATE INDEX idx_spesifikasi_cepat_barang_sync_status ON spesifikasi_cepat_barang(sync_status);

-- Table: subkategori_barang
CREATE TABLE "subkategori_barang" (
      id TEXT PRIMARY KEY,
      kategori_id TEXT NOT NULL,
      nama TEXT NOT NULL,
      urutan_tampilan INTEGER DEFAULT 0,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')), sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (kategori_id) REFERENCES "kategori_barang"(id) ON DELETE CASCADE
    );

-- Indexes for subkategori_barang
CREATE INDEX idx_subkategori_bahan_kategori ON "subkategori_barang"(kategori_id);
CREATE INDEX idx_subkategori_bahan_nama ON "subkategori_barang"(nama);
CREATE INDEX idx_subkategori_barang_sync_status ON subkategori_barang(sync_status);

-- Table: vendor
CREATE TABLE "vendor" (
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
    , sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1);

-- Indexes for vendor
CREATE INDEX idx_vendor_sync_status ON vendor(sync_status);

