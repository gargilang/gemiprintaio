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
      average_cost_per_base_unit REAL DEFAULT 0,
      level_stok_minimum REAL DEFAULT 0,
      lacak_inventori_status INTEGER DEFAULT 1,
      butuh_dimensi_status INTEGER DEFAULT 0,
      roll_inventory_status INTEGER NOT NULL DEFAULT 0,
      default_location_id TEXT DEFAULT 'main',
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')), frekuensi_terjual INTEGER DEFAULT 0, sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (kategori_id) REFERENCES kategori_barang(id) ON DELETE SET NULL,
      FOREIGN KEY (subkategori_id) REFERENCES subkategori_barang(id) ON DELETE SET NULL
    );

-- Indexes for barang
CREATE INDEX idx_barang_sync_status ON barang(sync_status);

-- Table: barang_roll_variants
CREATE TABLE barang_roll_variants (
      id TEXT PRIMARY KEY,
      barang_id TEXT NOT NULL,
      lebar_m REAL NOT NULL,
      panjang_tersedia_m REAL NOT NULL DEFAULT 0,
      average_cost_per_m2 REAL NOT NULL DEFAULT 0,
      aktif_status INTEGER NOT NULL DEFAULT 1,
      catatan TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (barang_id) REFERENCES barang(id) ON DELETE CASCADE,
      CONSTRAINT barang_roll_variants_width_positive CHECK(lebar_m > 0),
      CONSTRAINT barang_roll_variants_length_nonnegative CHECK(panjang_tersedia_m >= 0),
      CONSTRAINT barang_roll_variants_unique_width UNIQUE(barang_id, lebar_m)
);

CREATE INDEX idx_barang_roll_variants_barang ON barang_roll_variants(barang_id, aktif_status, lebar_m);

-- Table: inventory_movements
CREATE TABLE inventory_movements (
      id TEXT PRIMARY KEY,
      barang_id TEXT NOT NULL,
      tanggal TEXT NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('OPENING_BALANCE','PURCHASE_RECEIPT','SALE_ISSUE','SALE_VOID','SALE_RETURN','PURCHASE_VOID','PURCHASE_RETURN','ADJUSTMENT','WASTE','ROLL_CONVERSION_OUT','ROLL_CONVERSION_IN','PRODUCTION_ISSUE','PRODUCTION_WASTE')),
      qty_delta REAL NOT NULL,
      unit_cost REAL NOT NULL DEFAULT 0,
      value_delta REAL NOT NULL DEFAULT 0,
      qty_before REAL NOT NULL DEFAULT 0,
      qty_after REAL NOT NULL DEFAULT 0,
      avg_cost_before REAL NOT NULL DEFAULT 0,
      avg_cost_after REAL NOT NULL DEFAULT 0,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_line_id TEXT,
      reversal_of_id TEXT,
      catatan TEXT,
      dibuat_oleh TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      location_id TEXT DEFAULT 'main',
      roll_variant_id TEXT,
      roll_width_m REAL,
      linear_delta_m REAL,
      FOREIGN KEY (barang_id) REFERENCES barang(id),
      FOREIGN KEY (reversal_of_id) REFERENCES inventory_movements(id),
      FOREIGN KEY (roll_variant_id) REFERENCES barang_roll_variants(id) ON DELETE SET NULL,
      FOREIGN KEY (dibuat_oleh) REFERENCES profil(id),
      FOREIGN KEY (location_id) REFERENCES lokasi(id)
    );

-- Indexes for inventory_movements
CREATE INDEX idx_inventory_movements_barang ON inventory_movements(barang_id, dibuat_pada);
CREATE INDEX idx_inventory_movements_source ON inventory_movements(source_type, source_id);
CREATE INDEX idx_inventory_movements_line ON inventory_movements(source_line_id);
CREATE INDEX idx_inventory_movements_type ON inventory_movements(movement_type);
CREATE INDEX idx_inventory_movements_sync_status ON inventory_movements(sync_status);
CREATE INDEX idx_inventory_movements_location ON inventory_movements(location_id);
CREATE INDEX idx_inventory_movements_roll_variant ON inventory_movements(roll_variant_id, dibuat_pada);

-- Table: lokasi
CREATE TABLE lokasi (
      id TEXT PRIMARY KEY,
      nama TEXT NOT NULL,
      kode TEXT UNIQUE,
      alamat TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      aktif_status INTEGER NOT NULL DEFAULT 1,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1
    );

-- Table: accounting_periods
CREATE TABLE accounting_periods (
      id TEXT PRIMARY KEY,
      period_key TEXT NOT NULL UNIQUE,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLOSED')),
      closed_at TEXT,
      closed_by TEXT,
      catatan TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (closed_by) REFERENCES profil(id)
    );
CREATE INDEX idx_accounting_periods_status ON accounting_periods(status, start_date, end_date);

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
      panjang REAL,
      lebar REAL,
      jumlah_roll INTEGER NOT NULL DEFAULT 1,
      dpp_satuan REAL NOT NULL DEFAULT 0,
      ppn_satuan REAL NOT NULL DEFAULT 0,
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      purchase_order_item_id TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')), sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (pembelian_id) REFERENCES pembelian(id) ON DELETE CASCADE,
      FOREIGN KEY (barang_id) REFERENCES "barang"(id),
      FOREIGN KEY (harga_satuan_id) REFERENCES "harga_barang_satuan"(id)
    );

-- Indexes for item_pembelian
CREATE INDEX idx_item_pembelian_sync_status ON item_pembelian(sync_status);
CREATE INDEX idx_item_pembelian_po_item ON item_pembelian(purchase_order_item_id);

-- Table: penawaran
CREATE TABLE penawaran (
      id TEXT PRIMARY KEY,
      nomor_penawaran TEXT UNIQUE NOT NULL,
      pelanggan_id TEXT,
      pelanggan_nama_snapshot TEXT,
      pelanggan_kota TEXT,
      tanggal TEXT NOT NULL DEFAULT (date('now')),
      berlaku_sampai TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SENT','ACCEPTED','CONVERTED','CANCELLED','EXPIRED')),
      total_jumlah REAL NOT NULL DEFAULT 0,
      kena_ppn INTEGER NOT NULL DEFAULT 0,
      ppn_persen REAL NOT NULL DEFAULT 0,
      ppn_metode TEXT NOT NULL DEFAULT 'EKSKLUSIF' CHECK(ppn_metode IN ('EKSKLUSIF','INKLUSIF')),
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      catatan TEXT,
      dibuat_oleh TEXT,
      converted_penjualan_id TEXT,
      converted_at TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id),
      FOREIGN KEY (dibuat_oleh) REFERENCES profil(id),
      FOREIGN KEY (converted_penjualan_id) REFERENCES penjualan(id)
    );
CREATE INDEX idx_penawaran_status ON penawaran(status, tanggal);
CREATE INDEX idx_penawaran_pelanggan ON penawaran(pelanggan_id);

-- Table: item_penawaran
CREATE TABLE item_penawaran (
      id TEXT PRIMARY KEY,
      penawaran_id TEXT NOT NULL,
      barang_id TEXT NOT NULL,
      harga_satuan_id TEXT,
      jumlah REAL NOT NULL,
      nama_satuan TEXT NOT NULL,
      faktor_konversi REAL NOT NULL DEFAULT 1,
      harga_satuan REAL NOT NULL,
      subtotal REAL NOT NULL,
      panjang REAL,
      lebar REAL,
      jumlah_lembar INTEGER,
      tipe_item TEXT NOT NULL DEFAULT 'BARANG' CHECK(tipe_item IN ('BARANG','JASA','MAKLON')),
      vendor_subkontrak_id TEXT,
      biaya_subkontrak REAL,
      metode_bayar_vendor TEXT CHECK(metode_bayar_vendor IS NULL OR metode_bayar_vendor IN ('CASH','NET30')),
      deskripsi_pekerjaan TEXT,
      dpp_satuan REAL NOT NULL DEFAULT 0,
      ppn_satuan REAL NOT NULL DEFAULT 0,
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (penawaran_id) REFERENCES penawaran(id) ON DELETE CASCADE,
      FOREIGN KEY (barang_id) REFERENCES barang(id),
      FOREIGN KEY (harga_satuan_id) REFERENCES harga_barang_satuan(id),
      FOREIGN KEY (vendor_subkontrak_id) REFERENCES vendor(id) ON DELETE SET NULL
    );
CREATE INDEX idx_item_penawaran_doc ON item_penawaran(penawaran_id);

-- Table: purchase_orders
CREATE TABLE purchase_orders (
      id TEXT PRIMARY KEY,
      nomor_po TEXT UNIQUE NOT NULL,
      vendor_id TEXT,
      tanggal TEXT NOT NULL DEFAULT (date('now')),
      expected_date TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SENT','PARTIAL_RECEIVED','RECEIVED','CANCELLED')),
      total_jumlah REAL NOT NULL DEFAULT 0,
      kena_ppn INTEGER NOT NULL DEFAULT 0,
      ppn_persen REAL NOT NULL DEFAULT 0,
      ppn_metode TEXT NOT NULL DEFAULT 'EKSKLUSIF' CHECK(ppn_metode IN ('EKSKLUSIF','INKLUSIF')),
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      catatan TEXT,
      dibuat_oleh TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (vendor_id) REFERENCES vendor(id),
      FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
    );
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status, tanggal);
CREATE INDEX idx_purchase_orders_vendor ON purchase_orders(vendor_id);

-- Table: purchase_order_items
CREATE TABLE purchase_order_items (
      id TEXT PRIMARY KEY,
      purchase_order_id TEXT NOT NULL,
      barang_id TEXT NOT NULL,
      harga_satuan_id TEXT,
      jumlah REAL NOT NULL,
      qty_received REAL NOT NULL DEFAULT 0,
      nama_satuan TEXT NOT NULL,
      faktor_konversi REAL NOT NULL DEFAULT 1,
      harga_satuan REAL NOT NULL,
      subtotal REAL NOT NULL,
      panjang REAL,
      lebar REAL,
      jumlah_roll INTEGER,
      dpp_satuan REAL NOT NULL DEFAULT 0,
      ppn_satuan REAL NOT NULL DEFAULT 0,
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (barang_id) REFERENCES barang(id),
      FOREIGN KEY (harga_satuan_id) REFERENCES harga_barang_satuan(id)
    );
CREATE INDEX idx_purchase_order_items_doc ON purchase_order_items(purchase_order_id);

-- Table: retur_penjualan
CREATE TABLE retur_penjualan (
      id TEXT PRIMARY KEY,
      nomor_retur TEXT UNIQUE NOT NULL,
      penjualan_id TEXT NOT NULL,
      tanggal TEXT NOT NULL DEFAULT (date('now')),
      status TEXT NOT NULL DEFAULT 'POSTED' CHECK(status IN ('POSTED','CANCELLED')),
      total_retur REAL NOT NULL DEFAULT 0,
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      total_hpp REAL NOT NULL DEFAULT 0,
      receivable_reduction REAL NOT NULL DEFAULT 0,
      refund_amount REAL NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      catatan TEXT,
      dibuat_oleh TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (penjualan_id) REFERENCES penjualan(id),
      FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
    );
CREATE INDEX idx_retur_penjualan_sale ON retur_penjualan(penjualan_id, tanggal);

-- Table: item_retur_penjualan
CREATE TABLE item_retur_penjualan (
      id TEXT PRIMARY KEY,
      retur_penjualan_id TEXT NOT NULL,
      item_penjualan_id TEXT NOT NULL,
      barang_id TEXT NOT NULL,
      qty REAL NOT NULL,
      qty_base REAL NOT NULL,
      nama_satuan TEXT NOT NULL,
      faktor_konversi REAL NOT NULL DEFAULT 1,
      harga_satuan REAL NOT NULL,
      subtotal REAL NOT NULL,
      hpp_satuan REAL NOT NULL DEFAULT 0,
      hpp_total REAL NOT NULL DEFAULT 0,
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      movement_id TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (retur_penjualan_id) REFERENCES retur_penjualan(id) ON DELETE CASCADE,
      FOREIGN KEY (item_penjualan_id) REFERENCES item_penjualan(id),
      FOREIGN KEY (barang_id) REFERENCES barang(id),
      FOREIGN KEY (movement_id) REFERENCES inventory_movements(id)
    );
CREATE INDEX idx_item_retur_penjualan_doc ON item_retur_penjualan(retur_penjualan_id);
CREATE INDEX idx_item_retur_penjualan_source ON item_retur_penjualan(item_penjualan_id);

-- Table: retur_pembelian
CREATE TABLE retur_pembelian (
      id TEXT PRIMARY KEY,
      nomor_retur TEXT UNIQUE NOT NULL,
      pembelian_id TEXT NOT NULL,
      tanggal TEXT NOT NULL DEFAULT (date('now')),
      status TEXT NOT NULL DEFAULT 'POSTED' CHECK(status IN ('POSTED','CANCELLED')),
      total_retur REAL NOT NULL DEFAULT 0,
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      debt_reduction REAL NOT NULL DEFAULT 0,
      refund_amount REAL NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      catatan TEXT,
      dibuat_oleh TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (pembelian_id) REFERENCES pembelian(id),
      FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
    );
CREATE INDEX idx_retur_pembelian_purchase ON retur_pembelian(pembelian_id, tanggal);

-- Table: item_retur_pembelian
CREATE TABLE item_retur_pembelian (
      id TEXT PRIMARY KEY,
      retur_pembelian_id TEXT NOT NULL,
      item_pembelian_id TEXT NOT NULL,
      barang_id TEXT NOT NULL,
      qty REAL NOT NULL,
      qty_base REAL NOT NULL,
      nama_satuan TEXT NOT NULL,
      faktor_konversi REAL NOT NULL DEFAULT 1,
      harga_satuan REAL NOT NULL,
      subtotal REAL NOT NULL,
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      movement_id TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (retur_pembelian_id) REFERENCES retur_pembelian(id) ON DELETE CASCADE,
      FOREIGN KEY (item_pembelian_id) REFERENCES item_pembelian(id),
      FOREIGN KEY (barang_id) REFERENCES barang(id),
      FOREIGN KEY (movement_id) REFERENCES inventory_movements(id)
    );
CREATE INDEX idx_item_retur_pembelian_doc ON item_retur_pembelian(retur_pembelian_id);
CREATE INDEX idx_item_retur_pembelian_source ON item_retur_pembelian(item_pembelian_id);

-- Table: stock_opnames
CREATE TABLE stock_opnames (
      id TEXT PRIMARY KEY,
      nomor_opname TEXT UNIQUE NOT NULL,
      tanggal TEXT NOT NULL DEFAULT (date('now')),
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','POSTED','CANCELLED')),
      catatan TEXT,
      dibuat_oleh TEXT,
      posted_at TEXT,
      posted_by TEXT,
      total_items INTEGER NOT NULL DEFAULT 0,
      total_delta_qty REAL NOT NULL DEFAULT 0,
      total_delta_value REAL NOT NULL DEFAULT 0,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (dibuat_oleh) REFERENCES profil(id),
      FOREIGN KEY (posted_by) REFERENCES profil(id)
    );
CREATE INDEX idx_stock_opnames_status ON stock_opnames(status, tanggal);

-- Table: stock_opname_items
CREATE TABLE stock_opname_items (
      id TEXT PRIMARY KEY,
      stock_opname_id TEXT NOT NULL,
      barang_id TEXT NOT NULL,
      system_qty REAL NOT NULL DEFAULT 0,
      counted_qty REAL,
      delta_qty REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      delta_value REAL NOT NULL DEFAULT 0,
      catatan TEXT,
      movement_id TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (stock_opname_id) REFERENCES stock_opnames(id) ON DELETE CASCADE,
      FOREIGN KEY (barang_id) REFERENCES barang(id),
      FOREIGN KEY (movement_id) REFERENCES inventory_movements(id)
    );
CREATE INDEX idx_stock_opname_items_doc ON stock_opname_items(stock_opname_id);
CREATE INDEX idx_stock_opname_items_barang ON stock_opname_items(barang_id);

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
      hpp_satuan REAL DEFAULT 0,
      hpp_total REAL DEFAULT 0,
      gross_profit REAL DEFAULT 0,
      gross_margin REAL DEFAULT 0,
      panjang REAL,
      lebar REAL,
      tipe_item TEXT NOT NULL DEFAULT 'BARANG' CHECK(tipe_item IN ('BARANG','JASA','MAKLON')),
      vendor_subkontrak_id TEXT,
      biaya_subkontrak REAL,
      metode_bayar_vendor TEXT CHECK(metode_bayar_vendor IS NULL OR metode_bayar_vendor IN ('CASH','NET30')),
      pembelian_id_terkait TEXT,
      deskripsi_pekerjaan TEXT,
      dpp_satuan REAL NOT NULL DEFAULT 0,
      ppn_satuan REAL NOT NULL DEFAULT 0,
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      billed_panjang REAL,
      billed_lebar REAL,
      recommended_roll_width_m REAL,
      roll_inventory_deferred INTEGER NOT NULL DEFAULT 0,
      dibuat_pada TEXT DEFAULT (datetime('now')), sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (penjualan_id) REFERENCES penjualan(id) ON DELETE CASCADE,
      FOREIGN KEY (barang_id) REFERENCES "barang"(id),
      FOREIGN KEY (harga_satuan_id) REFERENCES "harga_barang_satuan"(id),
      FOREIGN KEY (vendor_subkontrak_id) REFERENCES vendor(id) ON DELETE SET NULL,
      FOREIGN KEY (pembelian_id_terkait) REFERENCES pembelian(id) ON DELETE SET NULL
    );

-- Indexes for item_penjualan
CREATE INDEX idx_item_penjualan_sync_status ON item_penjualan(sync_status);
CREATE INDEX idx_item_penjualan_tipe_item ON item_penjualan(tipe_item);
CREATE INDEX idx_item_penjualan_pembelian_terkait ON item_penjualan(pembelian_id_terkait);

-- Table: item_produksi
CREATE TABLE item_produksi (
      id TEXT PRIMARY KEY,
      order_produksi_id TEXT NOT NULL,
      item_penjualan_id TEXT NOT NULL,
      barang_id TEXT,
      barang_nama TEXT NOT NULL,
      jumlah REAL NOT NULL,
      nama_satuan TEXT NOT NULL,
      panjang REAL,
      lebar REAL,
      billed_panjang REAL,
      billed_lebar REAL,
      recommended_roll_width_m REAL,
      roll_inventory_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED' CHECK(roll_inventory_status IN ('NOT_REQUIRED','PENDING','POSTED','VOIDED')),
      keterangan_dimensi TEXT,
      mesin_printing TEXT,
      jenis_bahan TEXT,
      status TEXT DEFAULT 'MENUNGGU',
      catatan_produksi TEXT,
      operator_id TEXT,
      mulai_proses TEXT,
      selesai_proses TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')), sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (order_produksi_id) REFERENCES order_produksi(id) ON DELETE CASCADE,
      FOREIGN KEY (item_penjualan_id) REFERENCES item_penjualan(id) ON DELETE CASCADE,
      FOREIGN KEY (barang_id) REFERENCES barang(id) ON DELETE SET NULL,
      FOREIGN KEY (operator_id) REFERENCES profil(id)
);

-- Table: production_material_consumptions
CREATE TABLE production_material_consumptions (
      id TEXT PRIMARY KEY,
      item_produksi_id TEXT NOT NULL,
      item_penjualan_id TEXT NOT NULL,
      barang_id TEXT NOT NULL,
      roll_variant_id TEXT NOT NULL,
      roll_width_m REAL NOT NULL,
      linear_used_m REAL NOT NULL,
      area_used_m2 REAL NOT NULL,
      billed_area_m2 REAL NOT NULL DEFAULT 0,
      waste_area_m2 REAL NOT NULL DEFAULT 0,
      movement_id TEXT,
      waste_movement_id TEXT,
      operator_id TEXT,
      status TEXT NOT NULL DEFAULT 'POSTED' CHECK(status IN ('POSTED','VOIDED')),
      catatan TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (item_produksi_id) REFERENCES item_produksi(id) ON DELETE CASCADE,
      FOREIGN KEY (item_penjualan_id) REFERENCES item_penjualan(id) ON DELETE CASCADE,
      FOREIGN KEY (barang_id) REFERENCES barang(id),
      FOREIGN KEY (roll_variant_id) REFERENCES barang_roll_variants(id),
      FOREIGN KEY (movement_id) REFERENCES inventory_movements(id),
      FOREIGN KEY (waste_movement_id) REFERENCES inventory_movements(id),
      FOREIGN KEY (operator_id) REFERENCES profil(id)
);

CREATE INDEX idx_production_consumptions_item ON production_material_consumptions(item_produksi_id, status);
CREATE INDEX idx_production_consumptions_roll ON production_material_consumptions(roll_variant_id, dibuat_pada);

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
      catatan TEXT,
      dibuat_oleh TEXT,
      diarsipkan_pada TEXT,
      label_arsip TEXT,
      reference_type TEXT,
      reference_id TEXT,
      dibuat_pada TEXT NOT NULL,
      diperbarui_pada TEXT NOT NULL,
      urutan_tampilan INTEGER DEFAULT 0,
      override_saldo INTEGER DEFAULT 0,
      override_omzet INTEGER DEFAULT 0,
      override_biaya_operasional INTEGER DEFAULT 0,
      override_biaya_bahan INTEGER DEFAULT 0,
      override_laba_bersih INTEGER DEFAULT 0,
    status_transaksi TEXT NOT NULL DEFAULT 'POSTED' CHECK(status_transaksi IN ('POSTED','VOIDED')), voided_at TEXT, voided_by TEXT, void_reason TEXT, periode_id TEXT REFERENCES accounting_periods(id), sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1);

-- Indexes for keuangan
CREATE INDEX idx_keuangan_sync_status ON keuangan(sync_status);
CREATE INDEX idx_keuangan_status_transaksi ON keuangan(status_transaksi);
CREATE INDEX idx_keuangan_periode_id ON keuangan(periode_id);

-- Table: finance_category_definitions
CREATE TABLE finance_category_definitions (
      id TEXT PRIMARY KEY,
      category_code TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      color_bg TEXT NOT NULL DEFAULT 'bg-gray-100',
      color_text TEXT NOT NULL DEFAULT 'text-gray-800',
      color_border TEXT NOT NULL DEFAULT 'border-gray-300',
      direction TEXT NOT NULL DEFAULT 'both' CHECK(direction IN ('debit', 'kredit', 'both')),
      is_active INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 0,
      metric_contributions TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    , sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1);

CREATE INDEX idx_finance_category_definitions_active ON finance_category_definitions(is_active, display_order);

-- Table: finance_metric_mappings
CREATE TABLE finance_metric_mappings (
      id TEXT PRIMARY KEY,
      metric_key TEXT NOT NULL UNIQUE,
      metric_label TEXT NOT NULL,
      metric_group TEXT NOT NULL CHECK(metric_group IN ('summary', 'profit_share', 'cash_advance')),
      source_column TEXT NOT NULL,
      participant_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    , sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1);

CREATE INDEX idx_finance_metric_mappings_active ON finance_metric_mappings(is_active, metric_group, display_order);

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
      status TEXT DEFAULT 'MENUNGGU',
      status_override_manual INTEGER NOT NULL DEFAULT 0,
      prioritas TEXT DEFAULT 'NORMAL' CHECK(prioritas IN ('RENDAH', 'NORMAL', 'TINGGI', 'MENDESAK', 'KILAT')),
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
      alamat_npwp TEXT,
      nama_di_npwp TEXT,
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
      diterima_oleh TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')), tanggal TEXT DEFAULT (date('now')), nomor_faktur TEXT, status_pembayaran TEXT DEFAULT 'LUNAS'
      CHECK(status_pembayaran IN ('LUNAS', 'HUTANG', 'SEBAGIAN')), sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
      tipe_pembelian TEXT NOT NULL DEFAULT 'BARANG' CHECK(tipe_pembelian IN ('BARANG','MAKLON')),
      penjualan_id_sumber TEXT,
      status_transaksi TEXT NOT NULL DEFAULT 'POSTED' CHECK(status_transaksi IN ('DRAFT','POSTED','VOIDED')),
      voided_at TEXT,
      voided_by TEXT,
      void_reason TEXT,
      kena_ppn INTEGER NOT NULL DEFAULT 0,
      ppn_persen REAL NOT NULL DEFAULT 0,
      ppn_metode TEXT NOT NULL DEFAULT 'EKSKLUSIF' CHECK(ppn_metode IN ('EKSKLUSIF','INKLUSIF')),
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      dapat_dikreditkan INTEGER NOT NULL DEFAULT 1,
      nomor_faktur_pajak_vendor TEXT,
      tanggal_faktur_pajak TEXT,
      vendor_npwp_snapshot TEXT,
      purchase_order_id TEXT,
      FOREIGN KEY (vendor_id) REFERENCES vendor(id),
      FOREIGN KEY (dibuat_oleh) REFERENCES profil(id),
      FOREIGN KEY (penjualan_id_sumber) REFERENCES penjualan(id) ON DELETE SET NULL
    );

-- Indexes for pembelian
CREATE INDEX idx_pembelian_sync_status ON pembelian(sync_status);
CREATE INDEX idx_pembelian_penjualan_sumber ON pembelian(penjualan_id_sumber);
CREATE INDEX idx_pembelian_tipe ON pembelian(tipe_pembelian);
CREATE INDEX idx_pembelian_status_transaksi ON pembelian(status_transaksi);
CREATE INDEX idx_pembelian_kena_ppn ON pembelian(kena_ppn);
CREATE INDEX idx_pembelian_dapat_dikreditkan ON pembelian(dapat_dikreditkan);
CREATE INDEX idx_pembelian_tanggal_faktur_pajak ON pembelian(tanggal_faktur_pajak);
CREATE INDEX idx_pembelian_purchase_order ON pembelian(purchase_order_id);

-- Table: penjualan
CREATE TABLE penjualan (
      id TEXT PRIMARY KEY,
      nomor_faktur TEXT UNIQUE NOT NULL,
      pelanggan_id TEXT,
      pelanggan_nama_snapshot TEXT,
      pelanggan_kota TEXT,
      total_jumlah REAL NOT NULL,
      jumlah_dibayar REAL DEFAULT 0,
      jumlah_kembalian REAL DEFAULT 0,
      metode_pembayaran TEXT,
      kasir_id TEXT,
      catatan TEXT,
      status_transaksi TEXT NOT NULL DEFAULT 'POSTED' CHECK(status_transaksi IN ('DRAFT','POSTED','VOIDED')),
      voided_at TEXT,
      voided_by TEXT,
      void_reason TEXT,
      kena_ppn INTEGER NOT NULL DEFAULT 0,
      ppn_persen REAL NOT NULL DEFAULT 0,
      ppn_metode TEXT NOT NULL DEFAULT 'EKSKLUSIF' CHECK(ppn_metode IN ('EKSKLUSIF','INKLUSIF')),
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      nsfp_kode_transaksi TEXT,
      nsfp_tahun TEXT,
      nsfp_nomor_seri TEXT,
      tanggal_faktur_pajak TEXT,
      pelanggan_npwp_snapshot TEXT,
      pelanggan_alamat_npwp_snapshot TEXT,
      pelanggan_nama_npwp_snapshot TEXT,
      penawaran_id TEXT,
      biaya_tambahan_total REAL NOT NULL DEFAULT 0,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')), sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id),
      FOREIGN KEY (kasir_id) REFERENCES profil(id)
    );

-- Indexes for penjualan
CREATE INDEX idx_penjualan_sync_status ON penjualan(sync_status);
CREATE INDEX idx_penjualan_status_transaksi ON penjualan(status_transaksi);
CREATE INDEX idx_penjualan_kena_ppn ON penjualan(kena_ppn);
CREATE INDEX idx_penjualan_tanggal_faktur_pajak ON penjualan(tanggal_faktur_pajak);
CREATE INDEX idx_penjualan_penawaran ON penjualan(penawaran_id);

-- Table: pengaturan_toko
CREATE TABLE pengaturan_toko (
      id TEXT PRIMARY KEY DEFAULT 'default',
      nama_toko TEXT NOT NULL DEFAULT 'Toko',
      slogan TEXT,
      alamat TEXT,
      telepon TEXT,
      email TEXT,
      website TEXT,
      bank_nama TEXT,
      bank_nomor TEXT,
      bank_atas_nama TEXT,
      catatan_faktur TEXT,
      catatan_struk TEXT,
      npwp TEXT,
      alamat_npwp TEXT,
      status_pkp INTEGER NOT NULL DEFAULT 0,
      ppn_persen_default REAL NOT NULL DEFAULT 11,
      ppn_metode_default TEXT NOT NULL DEFAULT 'EKSKLUSIF' CHECK(ppn_metode_default IN ('EKSKLUSIF','INKLUSIF')),
      ppn_default_aktif INTEGER NOT NULL DEFAULT 0,
      nsfp_kode_transaksi_default TEXT NOT NULL DEFAULT '01',
      nsfp_tahun_aktif TEXT,
      nsfp_seri_terakhir TEXT,
      inv_prefix TEXT NOT NULL DEFAULT 'INV',
      inv_format TEXT NOT NULL DEFAULT 'PREFIX-DATE-SEQ' CHECK(inv_format IN ('PREFIX-DATE-SEQ', 'PREFIX-SEQ')),
      inv_reset TEXT NOT NULL DEFAULT 'daily' CHECK(inv_reset IN ('daily', 'monthly', 'yearly', 'never')),
      inv_padding INTEGER NOT NULL DEFAULT 3,
      inv_start_seq INTEGER NOT NULL DEFAULT 1,
      spk_prefix TEXT NOT NULL DEFAULT 'SPK',
      spk_format TEXT NOT NULL DEFAULT 'PREFIX-SEQ' CHECK(spk_format IN ('PREFIX-DATE-SEQ', 'PREFIX-SEQ')),
      spk_reset TEXT NOT NULL DEFAULT 'never' CHECK(spk_reset IN ('daily', 'monthly', 'yearly', 'never')),
      spk_padding INTEGER NOT NULL DEFAULT 4,
      spk_start_seq INTEGER NOT NULL DEFAULT 1,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1
    );

-- Table: nsfp_pool
CREATE TABLE nsfp_pool (
      id TEXT PRIMARY KEY,
      tahun TEXT NOT NULL,
      kode_transaksi TEXT NOT NULL DEFAULT '01',
      nomor_seri TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'TERSEDIA' CHECK(status IN ('TERSEDIA','TERPAKAI','BATAL')),
      penjualan_id TEXT,
      catatan TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      UNIQUE (tahun, kode_transaksi, nomor_seri)
    );
CREATE INDEX idx_nsfp_pool_status ON nsfp_pool(status, tahun, nomor_seri);
CREATE INDEX idx_nsfp_pool_penjualan ON nsfp_pool(penjualan_id);

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
      role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'manager', 'staff', 'kasir', 'operator', 'user')),
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
      npwp TEXT,
      alamat_npwp TEXT,
      nama_di_npwp TEXT,
      tipe_vendor TEXT NOT NULL DEFAULT 'SUPPLIER' CHECK(tipe_vendor IN ('SUPPLIER','SUBKONTRAKTOR','KEDUANYA')),
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now'))
    , sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')), last_synced_at TEXT, sync_version INTEGER DEFAULT 1);

-- Indexes for vendor
CREATE INDEX idx_vendor_sync_status ON vendor(sync_status);
CREATE INDEX idx_vendor_tipe ON vendor(tipe_vendor);

-- Table: surat_jalan
CREATE TABLE surat_jalan (
      id TEXT PRIMARY KEY,
      nomor_sj TEXT UNIQUE NOT NULL,
      penjualan_id TEXT,
      pelanggan_nama TEXT,
      pelanggan_alamat TEXT,
      pelanggan_telepon TEXT,
      tanggal TEXT NOT NULL,
      nomor_kendaraan TEXT,
      pengirim_nama TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','TERKIRIM','DITERIMA','BATAL')),
      catatan TEXT,
      dibuat_oleh TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      tanggal_terkirim TEXT,
      tanggal_diterima TEXT,
      diterima_oleh TEXT,
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (penjualan_id) REFERENCES penjualan(id) ON DELETE SET NULL,
      FOREIGN KEY (dibuat_oleh) REFERENCES profil(id) ON DELETE SET NULL
    );

CREATE INDEX idx_surat_jalan_penjualan ON surat_jalan(penjualan_id);
CREATE INDEX idx_surat_jalan_status ON surat_jalan(status);
CREATE INDEX idx_surat_jalan_tanggal ON surat_jalan(tanggal DESC);
CREATE INDEX idx_surat_jalan_sync_status ON surat_jalan(sync_status);

-- Table: item_surat_jalan
CREATE TABLE item_surat_jalan (
      id TEXT PRIMARY KEY,
      surat_jalan_id TEXT NOT NULL,
      nama_barang TEXT NOT NULL,
      keterangan TEXT,
      ukuran TEXT,
      qty REAL NOT NULL DEFAULT 1,
      satuan TEXT,
      urutan INTEGER NOT NULL DEFAULT 0,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (surat_jalan_id) REFERENCES surat_jalan(id) ON DELETE CASCADE
    );

CREATE INDEX idx_item_surat_jalan_sj ON item_surat_jalan(surat_jalan_id);
CREATE INDEX idx_item_surat_jalan_sync_status ON item_surat_jalan(sync_status);

-- ── Modul Penggajian ──────────────────────────────────────────────
-- Table: komponen_kompensasi (definisi komponen gaji per karyawan)
CREATE TABLE komponen_kompensasi (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      tipe TEXT NOT NULL CHECK(tipe IN ('GAJI_POKOK','TUNJANGAN','KOMISI','BONUS')),
      nama TEXT NOT NULL,
      metode TEXT NOT NULL DEFAULT 'TETAP' CHECK(metode IN ('TETAP','PERSEN')),
      nominal REAL NOT NULL DEFAULT 0,
      persen REAL NOT NULL DEFAULT 0,
      sumber_formula_key TEXT,
      aktif_status INTEGER NOT NULL DEFAULT 1,
      urutan_tampilan INTEGER NOT NULL DEFAULT 0,
      catatan TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (actor_id) REFERENCES pegawai(id) ON DELETE CASCADE
    );

CREATE INDEX idx_komponen_kompensasi_actor ON komponen_kompensasi(actor_id);
CREATE INDEX idx_komponen_kompensasi_aktif ON komponen_kompensasi(aktif_status);
CREATE INDEX idx_komponen_kompensasi_sync ON komponen_kompensasi(sync_status);

-- Table: proses_gaji (header proses penggajian satu periode)
CREATE TABLE proses_gaji (
      id TEXT PRIMARY KEY,
      periode TEXT NOT NULL,
      tanggal_bayar TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','DIBAYAR','VOIDED')),
      metode_bayar TEXT NOT NULL DEFAULT 'CASH' CHECK(metode_bayar IN ('CASH','TRANSFER')),
      total_bruto REAL NOT NULL DEFAULT 0,
      total_potongan_kasbon REAL NOT NULL DEFAULT 0,
      total_neto REAL NOT NULL DEFAULT 0,
      catatan TEXT,
      dibuat_oleh TEXT,
      voided_at TEXT,
      voided_by TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT
    );

CREATE INDEX idx_proses_gaji_status ON proses_gaji(status);
CREATE INDEX idx_proses_gaji_periode ON proses_gaji(periode);
CREATE INDEX idx_proses_gaji_sync ON proses_gaji(sync_status);

-- Table: slip_gaji (slip gaji per karyawan dalam satu run)
CREATE TABLE slip_gaji (
      id TEXT PRIMARY KEY,
      proses_gaji_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      bruto REAL NOT NULL DEFAULT 0,
      potongan_kasbon REAL NOT NULL DEFAULT 0,
      neto REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','DIBAYAR','VOIDED')),
      metode_bayar TEXT NOT NULL DEFAULT 'CASH' CHECK(metode_bayar IN ('CASH','TRANSFER')),
      keuangan_ref_id TEXT,
      komponen_snapshot TEXT,
      catatan TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (proses_gaji_id) REFERENCES proses_gaji(id) ON DELETE CASCADE,
      FOREIGN KEY (actor_id) REFERENCES pegawai(id) ON DELETE CASCADE
    );

CREATE INDEX idx_slip_gaji_run ON slip_gaji(proses_gaji_id);
CREATE INDEX idx_slip_gaji_actor ON slip_gaji(actor_id);
CREATE INDEX idx_slip_gaji_sync ON slip_gaji(sync_status);

-- Table: pinjaman_karyawan (ledger kasbon sebagai piutang)
CREATE TABLE pinjaman_karyawan (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      tanggal TEXT NOT NULL DEFAULT (date('now')),
      jumlah REAL NOT NULL DEFAULT 0,
      jenis TEXT NOT NULL CHECK(jenis IN ('TARIK','POTONG_GAJI','BAYAR_TUNAI','POTONG_BAGI_HASIL')),
      keterangan TEXT,
      keuangan_ref_id TEXT,
      proses_gaji_id TEXT,
      dibuat_oleh TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (actor_id) REFERENCES pegawai(id) ON DELETE CASCADE,
      FOREIGN KEY (proses_gaji_id) REFERENCES proses_gaji(id) ON DELETE SET NULL
    );

CREATE INDEX idx_pinjaman_karyawan_actor ON pinjaman_karyawan(actor_id);
CREATE INDEX idx_pinjaman_karyawan_jenis ON pinjaman_karyawan(jenis);
CREATE INDEX idx_pinjaman_karyawan_run ON pinjaman_karyawan(proses_gaji_id);
CREATE INDEX idx_pinjaman_karyawan_sync ON pinjaman_karyawan(sync_status);

-- Table: biaya_tambahan_penjualan
CREATE TABLE biaya_tambahan_penjualan (
      id TEXT PRIMARY KEY,
      penjualan_id TEXT NOT NULL,
      label TEXT NOT NULL,
      nominal REAL NOT NULL DEFAULT 0,
      urutan INTEGER NOT NULL DEFAULT 0,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (penjualan_id) REFERENCES penjualan(id) ON DELETE CASCADE
    );

CREATE INDEX idx_biaya_tambahan_penjualan_sale ON biaya_tambahan_penjualan(penjualan_id);
CREATE INDEX idx_biaya_tambahan_sync_status ON biaya_tambahan_penjualan(sync_status);

-- Table: laporan_bulanan
CREATE TABLE laporan_bulanan (
      id TEXT PRIMARY KEY,
      nomor_laporan TEXT NOT NULL UNIQUE,
      accounting_period_id TEXT NOT NULL REFERENCES accounting_periods(id),
      dibuat_oleh TEXT NOT NULL,
      dibuat_pada TEXT NOT NULL DEFAULT (datetime('now')),
      kata_pembuka TEXT,
      kata_penutup TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER NOT NULL DEFAULT 0,
      updated_at_server TEXT,
      updated_by_device TEXT,
      change_version INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT
    );

CREATE INDEX idx_laporan_bulanan_period ON laporan_bulanan(accounting_period_id);
CREATE INDEX idx_laporan_bulanan_sync ON laporan_bulanan(sync_status);
