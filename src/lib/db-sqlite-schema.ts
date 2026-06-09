/**
 * SQLite schema helpers — DDL migrations yang harus dijalankan saat init.
 * Diekstrak dari db-sqlite.ts.
 *
 * JANGAN import dari db-unified.ts — akan circular.
 */

import "server-only";
export function migratePeranPegawaiLegacyCheckConstraint(db: {
  prepare: (sql: string) => { get: () => { sql?: string } | undefined };
  pragma: (s: string) => void;
  exec: (sql: string) => void;
}): void {
  // Berjalan SETELAH rename English→Indonesia, jadi target tabelnya
  // `peran_pegawai` (bukan `actor_roles`). SQLite `RENAME TO` ikut membawa
  // CHECK constraint lama apa adanya, sehingga install lama yang masih punya
  // CHECK `role_group IN ('profit_share',...)` tetap perlu dibangun ulang di
  // sini agar nilai role_group baru (owner/management/sales/staff) tidak
  // ditolak saat seed.
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'peran_pegawai'"
    )
    .get();
  if (!row?.sql?.includes("profit_share")) return;

  db.pragma("foreign_keys = OFF");
  db.exec(`
    CREATE TABLE peran_pegawai_v2 (
      id            TEXT PRIMARY KEY,
      role_code     TEXT NOT NULL UNIQUE,
      role_label    TEXT NOT NULL,
      role_group    TEXT NOT NULL DEFAULT 'other',
      description   TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO peran_pegawai_v2
      (id, role_code, role_label, role_group, description, display_order, created_at, updated_at)
    SELECT
      id,
      role_code,
      role_label,
      CASE role_group
        WHEN 'profit_share' THEN 'owner'
        WHEN 'cash_advance' THEN 'staff'
        WHEN 'bonus' THEN
          CASE role_code
            WHEN 'SALES' THEN 'sales'
            WHEN 'MANAGER' THEN 'management'
            WHEN 'SUPERVISOR' THEN 'management'
            ELSE 'management'
          END
        ELSE 'other'
      END,
      description,
      display_order,
      created_at,
      updated_at
    FROM peran_pegawai;

    DROP TABLE peran_pegawai;
    ALTER TABLE peran_pegawai_v2 RENAME TO peran_pegawai;
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_peran_pegawai_group ON peran_pegawai(role_group);
    CREATE INDEX IF NOT EXISTS idx_peran_pegawai_order ON peran_pegawai(display_order);
  `);
  db.pragma("foreign_keys = ON");
  console.info(
    "✅ Migrated peran_pegawai: role_group is now owner/management/sales/staff/other"
  );
}

/**
 * Ensure existing SQLite installs have the inventory_movements CHECK
 * constraint that includes the new SALE_RETURN movement type.
 *
 * Older installs created the table with:
 *   movement_type IN ('OPENING_BALANCE','PURCHASE_RECEIPT','SALE_ISSUE',
 *                     'SALE_VOID','PURCHASE_VOID','PURCHASE_RETURN',
 *                     'ADJUSTMENT','WASTE')
 * which blocks INSERTs from createSalesReturn. Recreate the table without
 * the legacy constraint, copy rows, and reapply indexes.
 *
 * The migration is idempotent: if the table already accepts SALE_RETURN we
 * exit early after the cheapest possible probe.
 */
export function migrateInventoryMovementsCheckConstraint(db: {
  prepare: (sql: string) => {
    get: () => { sql?: string } | undefined;
    all: () => unknown[];
  };
  pragma: (s: string) => void;
  exec: (sql: string) => void;
}): void {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='inventory_movements'"
    )
    .get();
  if (!row?.sql) return;
  // If the create statement already mentions the production roll movement
  // types we're good.
  if (/PRODUCTION_ISSUE/.test(row.sql)) return;
  // If the table has a CHECK constraint on movement_type but no SALE_RETURN
  // in it, rebuild the table.
  if (!/movement_type[^)]*CHECK|CHECK[^)]*movement_type/i.test(row.sql)) {
    return;
  }

  db.pragma("foreign_keys = OFF");
  db.exec(`
    CREATE TABLE inventory_movements_v2 (
      id TEXT PRIMARY KEY,
      barang_id TEXT NOT NULL,
      tanggal TEXT NOT NULL,
      movement_type TEXT NOT NULL CHECK (movement_type IN (
        'OPENING_BALANCE','PURCHASE_RECEIPT','SALE_ISSUE','SALE_VOID',
        'SALE_RETURN','PURCHASE_VOID','PURCHASE_RETURN','ADJUSTMENT','WASTE',
        'ROLL_CONVERSION_OUT','ROLL_CONVERSION_IN','PRODUCTION_ISSUE','PRODUCTION_WASTE'
      )),
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
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      location_id TEXT,
      roll_variant_id TEXT,
      roll_width_m REAL,
      linear_delta_m REAL
    );
  `);

  // Detect available columns to handle older installs that miss some sync
  // metadata or location_id.
  const cols = (
    db
      .prepare("PRAGMA table_info(inventory_movements)")
      .all() as Array<{ name: string }>
  ).map((c) => c.name);
  const targetCols = [
    "id", "barang_id", "tanggal", "movement_type", "qty_delta", "unit_cost",
    "value_delta", "qty_before", "qty_after", "avg_cost_before", "avg_cost_after",
    "source_type", "source_id", "source_line_id", "reversal_of_id",
    "catatan", "dibuat_oleh", "dibuat_pada",
    "sync_status", "last_synced_at", "sync_version",
    "updated_at_server", "updated_by_device", "change_version",
    "is_deleted", "deleted_at", "client_mutation_id", "location_id",
    "roll_variant_id", "roll_width_m", "linear_delta_m",
  ];
  const shared = targetCols.filter((c) => cols.includes(c));
  const colList = shared.join(", ");
  db.exec(`
    INSERT INTO inventory_movements_v2 (${colList})
    SELECT ${colList} FROM inventory_movements;
    DROP TABLE inventory_movements;
    ALTER TABLE inventory_movements_v2 RENAME TO inventory_movements;
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_barang ON inventory_movements(barang_id, dibuat_pada);
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_source ON inventory_movements(source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_line ON inventory_movements(source_line_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory_movements(movement_type);
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_sync_status ON inventory_movements(sync_status);
  `);
  db.pragma("foreign_keys = ON");
  console.info("✅ Migrated inventory_movements: SALE_RETURN now allowed.");
}

/**
 * Ensure the commercial workflow V1 tables exist locally. Newer installs
 * will have these because they're defined inline in `ensureServerSQLiteSyncV2Schema`,
 * but older databases (created before the V1 migration shipped) need a
 * top-up so retur/PO/penawaran/opname pages don't crash.
 */
export function ensureCommercialWorkflowTables(db: { exec: (sql: string) => void }): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS penawaran (
      id TEXT PRIMARY KEY,
      nomor_penawaran TEXT NOT NULL UNIQUE,
      pelanggan_id TEXT,
      pelanggan_nama_snapshot TEXT,
      pelanggan_kota TEXT,
      tanggal TEXT NOT NULL DEFAULT (date('now')),
      berlaku_sampai TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK(status IN ('DRAFT','SENT','ACCEPTED','CONVERTED','CANCELLED','EXPIRED')),
      total_jumlah REAL NOT NULL DEFAULT 0,
      kena_ppn INTEGER NOT NULL DEFAULT 0,
      ppn_persen REAL NOT NULL DEFAULT 0,
      ppn_metode TEXT NOT NULL DEFAULT 'EKSKLUSIF'
        CHECK(ppn_metode IN ('EKSKLUSIF','INKLUSIF')),
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      catatan TEXT,
      dibuat_oleh TEXT,
      converted_penjualan_id TEXT,
      converted_at TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_penawaran_status ON penawaran(status, tanggal);
    CREATE INDEX IF NOT EXISTS idx_penawaran_pelanggan ON penawaran(pelanggan_id);

    CREATE TABLE IF NOT EXISTS item_penawaran (
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
      tipe_item TEXT NOT NULL DEFAULT 'BARANG'
        CHECK(tipe_item IN ('BARANG','JASA','MAKLON')),
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
      sync_status TEXT DEFAULT 'pending',
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_item_penawaran_doc ON item_penawaran(penawaran_id);

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      nomor_po TEXT NOT NULL UNIQUE,
      vendor_id TEXT,
      tanggal TEXT NOT NULL DEFAULT (date('now')),
      expected_date TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK(status IN ('DRAFT','SENT','PARTIAL_RECEIVED','RECEIVED','CANCELLED')),
      total_jumlah REAL NOT NULL DEFAULT 0,
      kena_ppn INTEGER NOT NULL DEFAULT 0,
      ppn_persen REAL NOT NULL DEFAULT 0,
      ppn_metode TEXT NOT NULL DEFAULT 'EKSKLUSIF'
        CHECK(ppn_metode IN ('EKSKLUSIF','INKLUSIF')),
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      catatan TEXT,
      dibuat_oleh TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending',
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status, tanggal);
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor ON purchase_orders(vendor_id);

    CREATE TABLE IF NOT EXISTS purchase_order_items (
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
      dpp_satuan REAL NOT NULL DEFAULT 0,
      ppn_satuan REAL NOT NULL DEFAULT 0,
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending',
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_purchase_order_items_doc ON purchase_order_items(purchase_order_id);

    CREATE TABLE IF NOT EXISTS retur_penjualan (
      id TEXT PRIMARY KEY,
      nomor_retur TEXT NOT NULL UNIQUE,
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
      sync_status TEXT DEFAULT 'pending',
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_retur_penjualan_sale ON retur_penjualan(penjualan_id, tanggal);

    CREATE TABLE IF NOT EXISTS item_retur_penjualan (
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
      sync_status TEXT DEFAULT 'pending',
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_item_retur_penjualan_doc ON item_retur_penjualan(retur_penjualan_id);
    CREATE INDEX IF NOT EXISTS idx_item_retur_penjualan_source ON item_retur_penjualan(item_penjualan_id);

    CREATE TABLE IF NOT EXISTS retur_pembelian (
      id TEXT PRIMARY KEY,
      nomor_retur TEXT NOT NULL UNIQUE,
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
      sync_status TEXT DEFAULT 'pending',
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_retur_pembelian_purchase ON retur_pembelian(pembelian_id, tanggal);

    CREATE TABLE IF NOT EXISTS item_retur_pembelian (
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
      sync_status TEXT DEFAULT 'pending',
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_item_retur_pembelian_doc ON item_retur_pembelian(retur_pembelian_id);
    CREATE INDEX IF NOT EXISTS idx_item_retur_pembelian_source ON item_retur_pembelian(item_pembelian_id);

    CREATE TABLE IF NOT EXISTS stock_opnames (
      id TEXT PRIMARY KEY,
      nomor_opname TEXT NOT NULL UNIQUE,
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
      sync_status TEXT DEFAULT 'pending',
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_stock_opnames_status ON stock_opnames(status, tanggal);

    CREATE TABLE IF NOT EXISTS stock_opname_items (
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
      sync_status TEXT DEFAULT 'pending',
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_stock_opname_items_doc ON stock_opname_items(stock_opname_id);
    CREATE INDEX IF NOT EXISTS idx_stock_opname_items_barang ON stock_opname_items(barang_id);
  `);

  // Add link columns on existing penjualan / pembelian / item_pembelian.
  const addColumnIfMissing = (table: string, column: string, type: string) => {
    try {
      const cols = (
        (db as any).prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
      ).map((c) => c.name);
      if (!cols.includes(column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      }
    } catch {
      // Table missing; nothing to do.
    }
  };
  addColumnIfMissing("penjualan", "penawaran_id", "TEXT");
  addColumnIfMissing("pembelian", "purchase_order_id", "TEXT");
  addColumnIfMissing("item_pembelian", "purchase_order_item_id", "TEXT");

  // Fase 5: rename kolom Inggris ke Bahasa Indonesia di instalasi SQLite lama.
  // SQLite mendukung RENAME COLUMN sejak 3.25 (Tauri pakai versi >= 3.40).
  const renameColumnIfNeeded = (table: string, oldCol: string, newCol: string) => {
    try {
      const cols = (
        (db as any).prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
      ).map((c) => c.name);
      if (cols.includes(oldCol) && !cols.includes(newCol)) {
        db.exec(`ALTER TABLE ${table} RENAME COLUMN ${oldCol} TO ${newCol}`);
      }
    } catch {
      // Tabel hilang; tidak perlu apa-apa.
    }
  };
  renameColumnIfNeeded("penjualan", "nomor_invoice", "nomor_faktur");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_penjualan_penawaran ON penjualan(penawaran_id);
    CREATE INDEX IF NOT EXISTS idx_pembelian_purchase_order ON pembelian(purchase_order_id);
    CREATE INDEX IF NOT EXISTS idx_item_pembelian_po_item ON item_pembelian(purchase_order_item_id);
  `);
}

/**
 * SQLite cannot ALTER a column to drop NOT NULL. Older installs created
 * cashbook_formula with `db_column TEXT NOT NULL`, which blocks seeding
 * formulas like modal_kas/piutang_kas/kas that legitimately have no
 * keuangan column (they only flow through transaction_computed).
 *
 * Recreate the table with a nullable db_column. The data is preserved.
 */