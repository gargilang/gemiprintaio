// Cegah jendela console tambahan di Windows saat release, JANGAN DIHAPUS!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod sync;

use rusqlite::{params, Connection, Result as SqlResult};
use std::io::Write;
use std::net::TcpStream;
use std::path::PathBuf;
#[cfg(not(debug_assertions))]
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Manager, State};
use uuid::Uuid;

#[derive(serde::Serialize)]
struct PrinterInfo {
    name: String,
    driver: Option<String>,
    port: Option<String>,
    status: Option<String>,
    is_default: bool,
}

#[cfg(not(debug_assertions))]
const BUNDLED_NEXT_PORT: u16 = 3000;
#[cfg(debug_assertions)]
const DEV_TAURI_SHELL_PORT: u16 = 3001;

struct AppState {
    db: Mutex<Option<Connection>>,
}

/// Holds the spawned Node.js child so we can kill it on exit.
#[cfg(not(debug_assertions))]
struct NextServerProcess(Mutex<Option<Child>>);

static LOG_DIR: OnceLock<PathBuf> = OnceLock::new();

fn init_log_dir() -> &'static PathBuf {
    LOG_DIR.get_or_init(|| {
        let dir = if cfg!(windows) {
            std::env::var("APPDATA")
                .map(|ad| PathBuf::from(ad).join("com.gemiprint.app"))
                .unwrap_or_else(|_| std::env::temp_dir().join("gemiprint"))
        } else {
            std::env::temp_dir().join("gemiprint")
        };
        let _ = std::fs::create_dir_all(&dir);
        dir
    })
}

fn slog(msg: &str) {
    let dir = init_log_dir();
    let log_file = dir.join("server.log");
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
    {
        let ts = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
        let _ = writeln!(f, "[{ts}] {msg}");
    }
    println!("{msg}");
}

// Inisialisasi koneksi database
fn init_database(app_handle: &tauri::AppHandle) -> SqlResult<Connection> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .expect("Failed to get app data directory");
    
    // Buat direktori kalau belum ada
    std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data directory");
    
    let db_path = app_data_dir.join("gemiprint.db");
    println!("Database path: {:?}", db_path);
    
    // Cek apakah database belum ada (first run)
    let is_first_run = !db_path.exists();
    
    if is_first_run {
        println!("First run detected - copying template database...");
        
        // Template database tertanam (dari /database/gemiprint.db)
        let template_db = include_bytes!("../../database/gemiprint.db");
        
        // Tulis template ke direktori data app
        std::fs::write(&db_path, template_db)
            .expect("Failed to copy template database");
        
        println!("Template database copied successfully with admin user data");
    } else {
        println!("Using existing database");
    }
    
    let conn = Connection::open(db_path)?;
    
    // Aktifkan foreign keys (tidak mengembalikan hasil)
    conn.execute("PRAGMA foreign_keys = ON", [])?;
    
    // Set WAL mode (returns results, need to use pragma_update or query_row)
    conn.pragma_update(None, "journal_mode", "WAL")?;
    
    // Inisialisasi schema kalau perlu
    init_schema(&conn)?;
    
    Ok(conn)
}

// Inisialisasi schema database
fn init_schema(conn: &Connection) -> SqlResult<()> {
    // Cek apakah database sudah diinisialisasi
    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='profil'",
            [],
            |row| {
                let count: i64 = row.get(0)?;
                Ok(count > 0)
            },
        )
        .unwrap_or(false);
    
    if !table_exists {
        println!("Initializing database schema...");
        
        // Untuk development, lewati saja inisialisasi schema kalau file bermasalah
        // Schema sebaiknya diinisialisasi manual atau lewat migration tool
        println!("NOTE: Skipping automatic schema initialization.");
        println!("Please ensure database is initialized manually if needed.");
        
        // Buka komentar di bawah untuk memaksa inisialisasi schema:
        /*
        let schema = include_str!("../../database/sqlite-schema.sql");
        conn.execute_batch(schema)?;
        */
    } else {
        println!("Database already initialized");
    }

    ensure_sync_v2_schema(conn)?;
    
    Ok(())
}

fn ensure_sync_v2_schema(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS inventory_movements (
          id TEXT PRIMARY KEY,
          barang_id TEXT NOT NULL,
          tanggal TEXT NOT NULL,
          movement_type TEXT NOT NULL CHECK(movement_type IN ('OPENING_BALANCE','PURCHASE_RECEIPT','SALE_ISSUE','SALE_VOID','PURCHASE_VOID','PURCHASE_RETURN','ADJUSTMENT','WASTE')),
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
          dibuat_pada TEXT NOT NULL DEFAULT (datetime('now')),
          diperbarui_pada TEXT NOT NULL DEFAULT (datetime('now')),
          sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
          last_synced_at TEXT,
          sync_version INTEGER DEFAULT 1,
          updated_at_server TEXT,
          updated_by_device TEXT DEFAULT 'tauri',
          change_version INTEGER DEFAULT 1,
          is_deleted INTEGER DEFAULT 0,
          deleted_at TEXT,
          client_mutation_id TEXT,
          FOREIGN KEY (barang_id) REFERENCES barang(id),
          FOREIGN KEY (reversal_of_id) REFERENCES inventory_movements(id)
        );
        CREATE INDEX IF NOT EXISTS idx_inventory_movements_barang ON inventory_movements(barang_id, dibuat_pada);
        CREATE INDEX IF NOT EXISTS idx_inventory_movements_source ON inventory_movements(source_type, source_id);
        CREATE INDEX IF NOT EXISTS idx_inventory_movements_line ON inventory_movements(source_line_id);
        CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory_movements(movement_type);
        CREATE INDEX IF NOT EXISTS idx_inventory_movements_sync_status ON inventory_movements(sync_status);"
    )?;
    let _ = conn.execute_batch(
        "INSERT OR IGNORE INTO inventory_movements (
          id, barang_id, tanggal, movement_type, qty_delta, unit_cost, value_delta,
          qty_before, qty_after, avg_cost_before, avg_cost_after,
          source_type, source_id, catatan, dibuat_oleh, sync_status,
          updated_by_device, change_version, is_deleted
        )
        SELECT
          'opening-' || id,
          id,
          date('now'),
          'OPENING_BALANCE',
          COALESCE(jumlah_stok, 0),
          COALESCE(average_cost_per_base_unit, 0),
          COALESCE(jumlah_stok, 0) * COALESCE(average_cost_per_base_unit, 0),
          0,
          COALESCE(jumlah_stok, 0),
          0,
          COALESCE(average_cost_per_base_unit, 0),
          'OPENING',
          id,
          'Backfill stok awal sebelum ledger aktif',
          NULL,
          'synced',
          'tauri',
          1,
          0
        FROM barang
        WHERE COALESCE(lacak_inventori_status, 1) <> 0
          AND COALESCE(jumlah_stok, 0) <> 0;"
    );

    for table in ["pembelian", "penjualan"] {
        let _ = conn.execute(
            &format!("ALTER TABLE {} ADD COLUMN status_transaksi TEXT NOT NULL DEFAULT 'POSTED' CHECK(status_transaksi IN ('DRAFT','POSTED','VOIDED'))", table),
            [],
        );
        let _ = conn.execute(&format!("ALTER TABLE {} ADD COLUMN voided_at TEXT", table), []);
        let _ = conn.execute(&format!("ALTER TABLE {} ADD COLUMN voided_by TEXT", table), []);
        let _ = conn.execute(&format!("ALTER TABLE {} ADD COLUMN void_reason TEXT", table), []);
        let _ = conn.execute(
            &format!("CREATE INDEX IF NOT EXISTS idx_{}_status_transaksi ON {}(status_transaksi)", table, table),
            [],
        );
    }

    let _ = conn.execute(
        "ALTER TABLE keuangan ADD COLUMN status_transaksi TEXT NOT NULL DEFAULT 'POSTED' CHECK(status_transaksi IN ('POSTED','VOIDED'))",
        [],
    );
    let _ = conn.execute("ALTER TABLE keuangan ADD COLUMN voided_at TEXT", []);
    let _ = conn.execute("ALTER TABLE keuangan ADD COLUMN voided_by TEXT", []);
    let _ = conn.execute("ALTER TABLE keuangan ADD COLUMN void_reason TEXT", []);
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_keuangan_status_transaksi ON keuangan(status_transaksi)",
        [],
    );

    // ── PPN columns ────────────────────────────────────────────────────────
    let ppn_party_cols: &[(&str, &[&str])] = &[
        (
            "pelanggan",
            &[
                "ALTER TABLE pelanggan ADD COLUMN alamat_npwp TEXT",
                "ALTER TABLE pelanggan ADD COLUMN nama_di_npwp TEXT",
            ],
        ),
        (
            "vendor",
            &[
                "ALTER TABLE vendor ADD COLUMN npwp TEXT",
                "ALTER TABLE vendor ADD COLUMN alamat_npwp TEXT",
                "ALTER TABLE vendor ADD COLUMN nama_di_npwp TEXT",
            ],
        ),
    ];
    for (_t, sqls) in ppn_party_cols {
        for sql in *sqls {
            let _ = conn.execute(sql, []);
        }
    }

    let ppn_sales_cols = [
        "ALTER TABLE penjualan ADD COLUMN kena_ppn INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE penjualan ADD COLUMN ppn_persen REAL NOT NULL DEFAULT 0",
        "ALTER TABLE penjualan ADD COLUMN ppn_metode TEXT NOT NULL DEFAULT 'EKSKLUSIF' CHECK(ppn_metode IN ('EKSKLUSIF','INKLUSIF'))",
        "ALTER TABLE penjualan ADD COLUMN dpp_total REAL NOT NULL DEFAULT 0",
        "ALTER TABLE penjualan ADD COLUMN ppn_total REAL NOT NULL DEFAULT 0",
        "ALTER TABLE penjualan ADD COLUMN nsfp_kode_transaksi TEXT",
        "ALTER TABLE penjualan ADD COLUMN nsfp_tahun TEXT",
        "ALTER TABLE penjualan ADD COLUMN nsfp_nomor_seri TEXT",
        "ALTER TABLE penjualan ADD COLUMN tanggal_faktur_pajak TEXT",
        "ALTER TABLE penjualan ADD COLUMN pelanggan_npwp_snapshot TEXT",
        "ALTER TABLE penjualan ADD COLUMN pelanggan_alamat_npwp_snapshot TEXT",
        "ALTER TABLE penjualan ADD COLUMN pelanggan_nama_npwp_snapshot TEXT",
        "ALTER TABLE item_penjualan ADD COLUMN dpp_satuan REAL NOT NULL DEFAULT 0",
        "ALTER TABLE item_penjualan ADD COLUMN ppn_satuan REAL NOT NULL DEFAULT 0",
        "ALTER TABLE item_penjualan ADD COLUMN dpp_total REAL NOT NULL DEFAULT 0",
        "ALTER TABLE item_penjualan ADD COLUMN ppn_total REAL NOT NULL DEFAULT 0",
        "CREATE INDEX IF NOT EXISTS idx_penjualan_kena_ppn ON penjualan(kena_ppn)",
        "CREATE INDEX IF NOT EXISTS idx_penjualan_tanggal_faktur_pajak ON penjualan(tanggal_faktur_pajak)",
    ];
    for sql in ppn_sales_cols {
        let _ = conn.execute(sql, []);
    }

    let ppn_purchase_cols = [
        "ALTER TABLE pembelian ADD COLUMN kena_ppn INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE pembelian ADD COLUMN ppn_persen REAL NOT NULL DEFAULT 0",
        "ALTER TABLE pembelian ADD COLUMN ppn_metode TEXT NOT NULL DEFAULT 'EKSKLUSIF' CHECK(ppn_metode IN ('EKSKLUSIF','INKLUSIF'))",
        "ALTER TABLE pembelian ADD COLUMN dpp_total REAL NOT NULL DEFAULT 0",
        "ALTER TABLE pembelian ADD COLUMN ppn_total REAL NOT NULL DEFAULT 0",
        "ALTER TABLE pembelian ADD COLUMN dapat_dikreditkan INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE pembelian ADD COLUMN nomor_faktur_pajak_vendor TEXT",
        "ALTER TABLE pembelian ADD COLUMN tanggal_faktur_pajak TEXT",
        "ALTER TABLE pembelian ADD COLUMN vendor_npwp_snapshot TEXT",
        "ALTER TABLE item_pembelian ADD COLUMN dpp_satuan REAL NOT NULL DEFAULT 0",
        "ALTER TABLE item_pembelian ADD COLUMN ppn_satuan REAL NOT NULL DEFAULT 0",
        "ALTER TABLE item_pembelian ADD COLUMN dpp_total REAL NOT NULL DEFAULT 0",
        "ALTER TABLE item_pembelian ADD COLUMN ppn_total REAL NOT NULL DEFAULT 0",
        "CREATE INDEX IF NOT EXISTS idx_pembelian_kena_ppn ON pembelian(kena_ppn)",
        "CREATE INDEX IF NOT EXISTS idx_pembelian_dapat_dikreditkan ON pembelian(dapat_dikreditkan)",
        "CREATE INDEX IF NOT EXISTS idx_pembelian_tanggal_faktur_pajak ON pembelian(tanggal_faktur_pajak)",
    ];
    for sql in ppn_purchase_cols {
        let _ = conn.execute(sql, []);
    }

    // ── Long-term hardening ──────────────────────────────────────────────
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS lokasi (
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
          sync_version INTEGER DEFAULT 1,
          updated_at_server TEXT,
          updated_by_device TEXT DEFAULT 'tauri',
          change_version INTEGER DEFAULT 1,
          is_deleted INTEGER DEFAULT 0,
          deleted_at TEXT,
          client_mutation_id TEXT
        );
        INSERT OR IGNORE INTO lokasi (id, nama, kode, is_default, aktif_status)
          VALUES ('main', 'Gudang Utama', 'MAIN', 1, 1);

        CREATE TABLE IF NOT EXISTS accounting_periods (
          id TEXT PRIMARY KEY,
          period_key TEXT NOT NULL UNIQUE,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED')),
          closed_at TEXT,
          closed_by TEXT,
          catatan TEXT,
          dibuat_pada TEXT DEFAULT (datetime('now')),
          diperbarui_pada TEXT DEFAULT (datetime('now')),
          sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
          last_synced_at TEXT,
          sync_version INTEGER DEFAULT 1,
          updated_at_server TEXT,
          updated_by_device TEXT DEFAULT 'tauri',
          change_version INTEGER DEFAULT 1,
          is_deleted INTEGER DEFAULT 0,
          deleted_at TEXT,
          client_mutation_id TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_accounting_periods_status
          ON accounting_periods(status, start_date, end_date);"
    );

    let hardening_cols = [
        "ALTER TABLE inventory_movements ADD COLUMN location_id TEXT DEFAULT 'main'",
        "ALTER TABLE barang ADD COLUMN default_location_id TEXT DEFAULT 'main'",
        "ALTER TABLE keuangan ADD COLUMN reference_type TEXT",
        "ALTER TABLE keuangan ADD COLUMN reference_id TEXT",
        "CREATE INDEX IF NOT EXISTS idx_inventory_movements_location ON inventory_movements(location_id)",
        "CREATE INDEX IF NOT EXISTS idx_keuangan_reference ON keuangan(reference_type, reference_id)",
    ];
    for sql in hardening_cols {
        let _ = conn.execute(sql, []);
    }

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS pengaturan_toko (
          id TEXT PRIMARY KEY DEFAULT 'default',
          nama_toko TEXT NOT NULL DEFAULT 'Toko',
          alamat TEXT,
          telepon TEXT,
          email TEXT,
          npwp TEXT,
          alamat_npwp TEXT,
          status_pkp INTEGER NOT NULL DEFAULT 0,
          ppn_persen_default REAL NOT NULL DEFAULT 11,
          ppn_metode_default TEXT NOT NULL DEFAULT 'EKSKLUSIF' CHECK(ppn_metode_default IN ('EKSKLUSIF','INKLUSIF')),
          ppn_default_aktif INTEGER NOT NULL DEFAULT 0,
          nsfp_kode_transaksi_default TEXT NOT NULL DEFAULT '01',
          nsfp_tahun_aktif TEXT,
          nsfp_seri_terakhir TEXT,
          dibuat_pada TEXT DEFAULT (datetime('now')),
          diperbarui_pada TEXT DEFAULT (datetime('now')),
          sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
          last_synced_at TEXT,
          sync_version INTEGER DEFAULT 1,
          updated_at_server TEXT,
          updated_by_device TEXT DEFAULT 'tauri',
          change_version INTEGER DEFAULT 1,
          is_deleted INTEGER DEFAULT 0,
          deleted_at TEXT,
          client_mutation_id TEXT
        );
        INSERT OR IGNORE INTO pengaturan_toko (id, nama_toko) VALUES ('default', 'Gemiprint');

        CREATE TABLE IF NOT EXISTS nsfp_pool (
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
          updated_at_server TEXT,
          updated_by_device TEXT DEFAULT 'tauri',
          change_version INTEGER DEFAULT 1,
          is_deleted INTEGER DEFAULT 0,
          deleted_at TEXT,
          client_mutation_id TEXT,
          UNIQUE (tahun, kode_transaksi, nomor_seri)
        );
        CREATE INDEX IF NOT EXISTS idx_nsfp_pool_status ON nsfp_pool(status, tahun, nomor_seri);
        CREATE INDEX IF NOT EXISTS idx_nsfp_pool_penjualan ON nsfp_pool(penjualan_id);"
    )?;

    let tables = [
        "kategori_barang",
        "subkategori_barang",
        "satuan_barang",
        "spesifikasi_cepat_barang",
        "barang",
        "harga_barang_satuan",
        "opsi_finishing",
        "pelanggan",
        "vendor",
        "profil",
        "kredensial",
        "penjualan",
        "item_penjualan",
        "pembelian",
        "item_pembelian",
        "inventory_movements",
        "piutang_penjualan",
        "pelunasan_piutang",
        "hutang_pembelian",
        "pelunasan_hutang",
        "order_produksi",
        "item_produksi",
        "item_finishing",
        "keuangan",
        "pengaturan_toko",
        "nsfp_pool",
        "lokasi",
        "accounting_periods",
    ];

    for table in tables {
        let add_cols = [
            format!("ALTER TABLE {} ADD COLUMN updated_at_server TEXT", table),
            format!("ALTER TABLE {} ADD COLUMN updated_by_device TEXT DEFAULT 'tauri'", table),
            format!("ALTER TABLE {} ADD COLUMN change_version INTEGER DEFAULT 1", table),
            format!("ALTER TABLE {} ADD COLUMN is_deleted INTEGER DEFAULT 0", table),
            format!("ALTER TABLE {} ADD COLUMN deleted_at TEXT", table),
            format!("ALTER TABLE {} ADD COLUMN client_mutation_id TEXT", table),
        ];
        for sql in add_cols {
            let _ = conn.execute(&sql, []);
        }
        let _ = conn.execute(
            &format!(
                "CREATE INDEX IF NOT EXISTS idx_{}_updated_at_server ON {}(updated_at_server)",
                table, table
            ),
            [],
        );
        let _ = conn.execute(
            &format!(
                "CREATE INDEX IF NOT EXISTS idx_{}_change_version ON {}(change_version)",
                table, table
            ),
            [],
        );
        let _ = conn.execute(
            &format!(
                "CREATE INDEX IF NOT EXISTS idx_{}_is_deleted ON {}(is_deleted)",
                table, table
            ),
            [],
        );
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS sync_conflicts (
          id TEXT PRIMARY KEY,
          table_name TEXT NOT NULL,
          record_id TEXT NOT NULL,
          conflict_type TEXT NOT NULL DEFAULT 'lww',
          winner_source TEXT NOT NULL,
          loser_source TEXT NOT NULL,
          winner_payload TEXT NOT NULL,
          loser_payload TEXT NOT NULL,
          winner_updated_at_server TEXT,
          loser_updated_at_server TEXT,
          resolved_at TEXT NOT NULL DEFAULT (datetime('now')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sync_mutation_registry (
          id TEXT PRIMARY KEY,
          client_mutation_id TEXT NOT NULL UNIQUE,
          table_name TEXT NOT NULL,
          record_id TEXT NOT NULL,
          device_id TEXT NOT NULL,
          processed_at TEXT NOT NULL DEFAULT (datetime('now')),
          payload_hash TEXT
        )",
        [],
    )?;
    // ── Modul Penggajian (Payroll) ──────────────────────────────────────
    // Empat tabel baru (mirror database/sqlite-schema.sql + supabase migrasi
    // 20260609000000_modul_penggajian.sql). Additive untuk install desktop lama.
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS komponen_kompensasi (
          id TEXT PRIMARY KEY,
          actor_id TEXT NOT NULL,
          tipe TEXT NOT NULL,
          nama TEXT NOT NULL,
          metode TEXT NOT NULL DEFAULT 'TETAP',
          nominal REAL NOT NULL DEFAULT 0,
          persen REAL NOT NULL DEFAULT 0,
          sumber_formula_key TEXT,
          aktif_status INTEGER NOT NULL DEFAULT 1,
          urutan_tampilan INTEGER NOT NULL DEFAULT 0,
          catatan TEXT,
          dibuat_pada TEXT DEFAULT (datetime('now')),
          diperbarui_pada TEXT DEFAULT (datetime('now')),
          sync_status TEXT DEFAULT 'pending',
          last_synced_at TEXT,
          sync_version INTEGER DEFAULT 1,
          updated_at_server TEXT,
          updated_by_device TEXT DEFAULT 'server',
          change_version INTEGER DEFAULT 0,
          is_deleted INTEGER NOT NULL DEFAULT 0,
          deleted_at TEXT,
          client_mutation_id TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_komponen_kompensasi_actor ON komponen_kompensasi(actor_id);
        CREATE INDEX IF NOT EXISTS idx_komponen_kompensasi_aktif ON komponen_kompensasi(aktif_status);

        CREATE TABLE IF NOT EXISTS proses_gaji (
          id TEXT PRIMARY KEY,
          periode TEXT NOT NULL,
          tanggal_bayar TEXT,
          status TEXT NOT NULL DEFAULT 'DRAFT',
          metode_bayar TEXT NOT NULL DEFAULT 'CASH',
          total_bruto REAL NOT NULL DEFAULT 0,
          total_potongan_kasbon REAL NOT NULL DEFAULT 0,
          total_neto REAL NOT NULL DEFAULT 0,
          catatan TEXT,
          dibuat_oleh TEXT,
          voided_at TEXT,
          voided_by TEXT,
          dibuat_pada TEXT DEFAULT (datetime('now')),
          diperbarui_pada TEXT DEFAULT (datetime('now')),
          sync_status TEXT DEFAULT 'pending',
          last_synced_at TEXT,
          sync_version INTEGER DEFAULT 1,
          updated_at_server TEXT,
          updated_by_device TEXT DEFAULT 'server',
          change_version INTEGER DEFAULT 0,
          is_deleted INTEGER NOT NULL DEFAULT 0,
          deleted_at TEXT,
          client_mutation_id TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_proses_gaji_status ON proses_gaji(status);
        CREATE INDEX IF NOT EXISTS idx_proses_gaji_periode ON proses_gaji(periode);

        CREATE TABLE IF NOT EXISTS slip_gaji (
          id TEXT PRIMARY KEY,
          proses_gaji_id TEXT NOT NULL,
          actor_id TEXT NOT NULL,
          bruto REAL NOT NULL DEFAULT 0,
          potongan_kasbon REAL NOT NULL DEFAULT 0,
          neto REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'DRAFT',
          metode_bayar TEXT NOT NULL DEFAULT 'CASH',
          keuangan_ref_id TEXT,
          komponen_snapshot TEXT,
          catatan TEXT,
          dibuat_pada TEXT DEFAULT (datetime('now')),
          diperbarui_pada TEXT DEFAULT (datetime('now')),
          sync_status TEXT DEFAULT 'pending',
          last_synced_at TEXT,
          sync_version INTEGER DEFAULT 1,
          updated_at_server TEXT,
          updated_by_device TEXT DEFAULT 'server',
          change_version INTEGER DEFAULT 0,
          is_deleted INTEGER NOT NULL DEFAULT 0,
          deleted_at TEXT,
          client_mutation_id TEXT,
          FOREIGN KEY (proses_gaji_id) REFERENCES proses_gaji(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_slip_gaji_run ON slip_gaji(proses_gaji_id);
        CREATE INDEX IF NOT EXISTS idx_slip_gaji_actor ON slip_gaji(actor_id);

        CREATE TABLE IF NOT EXISTS pinjaman_karyawan (
          id TEXT PRIMARY KEY,
          actor_id TEXT NOT NULL,
          tanggal TEXT NOT NULL DEFAULT (date('now')),
          jumlah REAL NOT NULL DEFAULT 0,
          jenis TEXT NOT NULL,
          keterangan TEXT,
          keuangan_ref_id TEXT,
          proses_gaji_id TEXT,
          dibuat_oleh TEXT,
          dibuat_pada TEXT DEFAULT (datetime('now')),
          diperbarui_pada TEXT DEFAULT (datetime('now')),
          sync_status TEXT DEFAULT 'pending',
          last_synced_at TEXT,
          sync_version INTEGER DEFAULT 1,
          updated_at_server TEXT,
          updated_by_device TEXT DEFAULT 'server',
          change_version INTEGER DEFAULT 0,
          is_deleted INTEGER NOT NULL DEFAULT 0,
          deleted_at TEXT,
          client_mutation_id TEXT,
          FOREIGN KEY (proses_gaji_id) REFERENCES proses_gaji(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_pinjaman_karyawan_actor ON pinjaman_karyawan(actor_id);
        CREATE INDEX IF NOT EXISTS idx_pinjaman_karyawan_jenis ON pinjaman_karyawan(jenis);
        CREATE INDEX IF NOT EXISTS idx_pinjaman_karyawan_run ON pinjaman_karyawan(proses_gaji_id);",
    );

    conn.execute(
        "CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )?;
    Ok(())
}

// Tauri command: Eksekusi query dan kembalikan semua baris
#[tauri::command]
async fn db_query(
    state: State<'_, AppState>,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<Vec<serde_json::Value>, String> {
    let db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;
    
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    
    let column_count = stmt.column_count();
    let column_names: Vec<String> = (0..column_count)
        .map(|i| stmt.column_name(i).unwrap_or("").to_string())
        .collect();
    
    // Convert JSON params to rusqlite params
    let rusqlite_params: Vec<rusqlite::types::Value> = params
        .iter()
        .map(|v| json_to_rusqlite_value(v))
        .collect();
    
    let rows = stmt
        .query_map(rusqlite::params_from_iter(rusqlite_params.iter()), |row| {
            let mut map = serde_json::Map::new();
            for (i, col_name) in column_names.iter().enumerate() {
                let value = row_value_to_json(row, i)?;
                map.insert(col_name.clone(), value);
            }
            Ok(serde_json::Value::Object(map))
        })
        .map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    
    Ok(result)
}

// Tauri command: Eksekusi query dan kembalikan satu baris
#[tauri::command]
async fn db_query_one(
    state: State<'_, AppState>,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<Option<serde_json::Value>, String> {
    let db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;
    
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    
    let column_count = stmt.column_count();
    let column_names: Vec<String> = (0..column_count)
        .map(|i| stmt.column_name(i).unwrap_or("").to_string())
        .collect();
    
    let rusqlite_params: Vec<rusqlite::types::Value> = params
        .iter()
        .map(|v| json_to_rusqlite_value(v))
        .collect();
    
    let result = stmt
        .query_row(rusqlite::params_from_iter(rusqlite_params.iter()), |row| {
            let mut map = serde_json::Map::new();
            for (i, col_name) in column_names.iter().enumerate() {
                let value = row_value_to_json(row, i)?;
                map.insert(col_name.clone(), value);
            }
            Ok(serde_json::Value::Object(map))
        });
    
    match result {
        Ok(value) => Ok(Some(value)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

// Tauri command: Sisipkan record
#[tauri::command]
async fn db_insert(
    state: State<'_, AppState>,
    table: String,
    data: serde_json::Value,
) -> Result<String, String> {
    let db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;
    
    let obj = data.as_object().ok_or("Data must be an object")?;

    if !is_safe_identifier(&table) {
        return Err(format!("Nama tabel tidak valid: {}", table));
    }
    for col in obj.keys() {
        if !is_safe_identifier(col) {
            return Err(format!("Nama kolom tidak valid: {}", col));
        }
    }

    // Ambil atau buat ID
    let id = if let Some(id_value) = obj.get("id") {
        if let Some(id_str) = id_value.as_str() {
            id_str.to_string()
        } else {
            Uuid::new_v4().to_string()
        }
    } else {
        Uuid::new_v4().to_string()
    };
    
    let columns: Vec<String> = obj.keys().cloned().collect();
    let placeholders: Vec<String> = (0..columns.len()).map(|_| "?".to_string()).collect();
    
    let sql = format!(
        "INSERT INTO {} ({}) VALUES ({})",
        table,
        columns.join(", "),
        placeholders.join(", ")
    );
    
    let values: Vec<rusqlite::types::Value> = columns
        .iter()
        .map(|col| json_to_rusqlite_value(obj.get(col).unwrap()))
        .collect();
    
    conn.execute(&sql, rusqlite::params_from_iter(values.iter()))
        .map_err(|e| e.to_string())?;
    
    Ok(id)
}

// Tauri command: Perbarui record
#[tauri::command]
async fn db_update(
    state: State<'_, AppState>,
    table: String,
    id: String,
    data: serde_json::Value,
) -> Result<(), String> {
    let db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;
    
    let obj = data.as_object().ok_or("Data must be an object")?;

    if !is_safe_identifier(&table) {
        return Err(format!("Nama tabel tidak valid: {}", table));
    }
    for col in obj.keys() {
        if !is_safe_identifier(col) {
            return Err(format!("Nama kolom tidak valid: {}", col));
        }
    }

    let set_clauses: Vec<String> = obj.keys().map(|k| format!("{} = ?", k)).collect();
    
    let sql = format!(
        "UPDATE {} SET {} WHERE id = ?",
        table,
        set_clauses.join(", ")
    );
    
    let mut values: Vec<rusqlite::types::Value> = obj
        .values()
        .map(|v| json_to_rusqlite_value(v))
        .collect();
    values.push(rusqlite::types::Value::Text(id));
    
    conn.execute(&sql, rusqlite::params_from_iter(values.iter()))
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

// Tauri command: Hapus record
#[tauri::command]
async fn db_delete(
    state: State<'_, AppState>,
    table: String,
    id: String,
) -> Result<(), String> {
    let db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;
    
    if !is_safe_identifier(&table) {
        return Err(format!("Nama tabel tidak valid: {}", table));
    }

    let sql = format!("DELETE FROM {} WHERE id = ?", table);
    
    conn.execute(&sql, params![id])
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

// Tauri command: Eksekusi SQL non-query (untuk update, delete, dll.)
#[tauri::command]
async fn db_execute(
    state: State<'_, AppState>,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<usize, String> {
    let db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;
    
    let rusqlite_params: Vec<rusqlite::types::Value> = params
        .iter()
        .map(|v| json_to_rusqlite_value(v))
        .collect();
    
    let affected = conn
        .execute(&sql, rusqlite::params_from_iter(rusqlite_params.iter()))
        .map_err(|e| e.to_string())?;
    
    Ok(affected)
}

// Helper: Validasi identifier SQL (nama tabel/kolom) sebelum interpolasi.
// db_insert/db_update/db_delete menyusun nama tabel & kolom langsung ke string
// SQL. Karena frontend + webview satu proses, XSS / supply-chain di frontend
// bisa memanggil command ini dengan nama jahat. Allowlist regex (huruf kecil,
// angka, underscore; diawali huruf/underscore) menutup vektor injeksi nama.
fn is_safe_identifier(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .next()
            .map_or(false, |c| c.is_ascii_lowercase() || c == '_')
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

// Helper: Convert JSON value to rusqlite Value
fn json_to_rusqlite_value(value: &serde_json::Value) -> rusqlite::types::Value {
    match value {
        serde_json::Value::Null => rusqlite::types::Value::Null,
        serde_json::Value::Bool(b) => rusqlite::types::Value::Integer(if *b { 1 } else { 0 }),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                rusqlite::types::Value::Integer(i)
            } else if let Some(f) = n.as_f64() {
                rusqlite::types::Value::Real(f)
            } else {
                rusqlite::types::Value::Null
            }
        }
        serde_json::Value::String(s) => rusqlite::types::Value::Text(s.clone()),
        serde_json::Value::Array(_) => {
            rusqlite::types::Value::Text(serde_json::to_string(value).unwrap())
        }
        serde_json::Value::Object(_) => {
            rusqlite::types::Value::Text(serde_json::to_string(value).unwrap())
        }
    }
}

// Helper: Convert rusqlite row value to JSON
fn row_value_to_json(row: &rusqlite::Row, index: usize) -> SqlResult<serde_json::Value> {
    let value = row.get_ref(index)?;
    
    Ok(match value {
        rusqlite::types::ValueRef::Null => serde_json::Value::Null,
        rusqlite::types::ValueRef::Integer(i) => serde_json::json!(i),
        rusqlite::types::ValueRef::Real(f) => serde_json::json!(f),
        rusqlite::types::ValueRef::Text(s) => {
            let text = String::from_utf8_lossy(s).to_string();
            serde_json::Value::String(text)
        }
        rusqlite::types::ValueRef::Blob(b) => {
            serde_json::Value::String(base64::encode(b))
        }
    })
}

// Helper untuk encoding base64 (implementasi sederhana)
mod base64 {
    pub fn encode(data: &[u8]) -> String {
        use std::fmt::Write;
        let mut encoded = String::new();
        for byte in data {
            write!(&mut encoded, "{:02x}", byte).unwrap();
        }
        encoded
    }
}

// Operasi sinkronisasi - Antrian untuk sync background ke Supabase
#[tauri::command]
async fn queue_sync_operation(
    state: State<'_, AppState>,
    table: String,
    operation: String,
    data: Option<String>,
    record_id: Option<String>,
) -> Result<(), String> {
    let db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;
    
    // Create sync_queue table if not exists
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sync_queue (
            id TEXT PRIMARY KEY,
            table_name TEXT NOT NULL,
            operation TEXT NOT NULL,
            record_id TEXT,
            data TEXT,
            created_at TEXT NOT NULL,
            synced_at TEXT,
            status TEXT DEFAULT 'pending',
            error_message TEXT
        )",
        [],
    ).map_err(|e| e.to_string())?;
    conn.execute(
        "ALTER TABLE sync_queue ADD COLUMN error_message TEXT",
        [],
    ).ok();
    
    // Sisipkan operasi sync
    let id = Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().to_rfc3339();
    
    conn.execute(
        "INSERT INTO sync_queue (id, table_name, operation, record_id, data, created_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, table, operation, record_id, data, created_at],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

// Hitung operasi sinkronisasi yang pending
#[tauri::command]
async fn count_pending_sync(
    state: State<'_, AppState>,
) -> Result<i64, String> {
    let db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;
    
    // Cek apakah tabel sync_queue ada
    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sync_queue'",
            [],
            |row| {
                let count: i64 = row.get(0)?;
                Ok(count > 0)
            },
        )
        .unwrap_or(false);
    
    if !table_exists {
        return Ok(0);
    }
    
    // Hitung operasi pending
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sync_queue WHERE synced_at IS NULL",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    
    Ok(count)
}

// Sync ke cloud - Proses operasi sync yang pending
#[tauri::command]
async fn sync_to_cloud(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // Step 1: Get operations from DB (synchronous, with lock)
    let operations = {
        let db_guard = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db_guard.as_ref().ok_or("Database not initialized")?;
        
        // Cek apakah tabel sync_queue ada
        let table_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sync_queue'",
                [],
                |row| {
                    let count: i64 = row.get(0)?;
                    Ok(count > 0)
                },
            )
            .unwrap_or(false);
        
        if !table_exists {
            return Ok(serde_json::json!({
                "synced": 0,
                "failed": 0,
                "message": "No sync queue table found"
            }));
        }
        
        // Ambil daftar operasi
        sync::get_operations_for_sync(conn)?
    }; // Lock released here
    
    if operations.is_empty() {
        return Ok(serde_json::json!({
            "synced": 0,
            "failed": 0,
            "message": "No pending operations"
        }));
    }
    
    // Coba ambil konfigurasi Supabase
    let config = match sync::SupabaseConfig::from_env() {
        Some(c) => c,
        None => {
            return Ok(serde_json::json!({
                "synced": 0,
                "failed": 0,
                "message": "Supabase not configured (missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY)"
            }));
        }
    };
    
    // Step 2: Process operations (async, no lock)
    let results = sync::process_sync_operations(operations, &config).await;
    
    // Step 3: Update status in DB (synchronous, with lock)
    let sync_result = {
        let db_guard = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db_guard.as_ref().ok_or("Database not initialized")?;
        sync::update_sync_status(conn, results)?
    }; // Lock released here
    
    Ok(serde_json::json!({
        "synced": sync_result.synced,
        "failed": sync_result.failed,
        "message": format!("Synced {} operations, {} failed", sync_result.synced, sync_result.failed)
    }))
}

#[tauri::command]
async fn sync_from_cloud(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let config = match sync::SupabaseConfig::from_env() {
        Some(c) => c,
        None => {
            return Ok(serde_json::json!({
                "pulled": 0,
                "failed": 0,
                "message": "Supabase not configured"
            }));
        }
    };

    let result = {
        let db_guard = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db_guard.as_ref().ok_or("Database not initialized")?;
        sync::pull_cloud_changes(conn, &config)?
    };

    Ok(serde_json::json!({
        "pulled": result.pulled,
        "failed": result.failed,
        "message": format!("Pulled {} rows, {} failed", result.pulled, result.failed)
    }))
}

/// Strip the Windows extended-length path prefix `\\?\` before handing a
/// path to Node.js. Node.js can open `\\?\` paths but Next.js's internal
/// regex-based path matching (e.g. `^[A-Z]:\\`) breaks when `__dirname`
/// starts with the prefix, causing the standalone server to crash on init.
#[cfg(all(not(debug_assertions), windows))]
fn strip_extended_prefix(p: PathBuf) -> PathBuf {
    let s = p.to_string_lossy();
    if let Some(rest) = s.strip_prefix(r"\\?\") {
        PathBuf::from(rest.to_string())
    } else {
        p
    }
}

fn next_port_listening(port: u16) -> bool {
    TcpStream::connect(("127.0.0.1", port)).is_ok()
}

fn wait_for_port_listening(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if next_port_listening(port) {
            return true;
        }
        thread::sleep(Duration::from_millis(150));
    }
    false
}

/// Walk from the .exe to find the repo’s `.next/standalone` (after `npm run build:tauri`).
#[cfg(not(debug_assertions))]
fn find_standalone_server_dir() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let mut dir = exe.parent()?.to_path_buf();
    for _ in 0..14 {
        let server_js = dir.join(".next").join("standalone").join("server.js");
        if server_js.is_file() {
            return server_js.parent().map(|p| p.to_path_buf());
        }
        dir = dir.parent()?.to_path_buf();
    }
    None
}

/// Bundled `tauri-bundle/`: `node` + `server/standalone` under `base`.
/// Tauri maps `../tauri-bundle` → `_up_/tauri-bundle` inside the resource dir,
/// so we try both `_up_/tauri-bundle/…` and plain `tauri-bundle/…`.
#[cfg(not(debug_assertions))]
fn bundled_node_and_server(base: &std::path::Path) -> Option<(PathBuf, PathBuf)> {
    #[cfg(windows)]
    {
        for prefix in &["_up_/tauri-bundle", "tauri-bundle"] {
            let node = base
                .join(prefix)
                .join("node")
                .join("node-v22.22.0-win-x64")
                .join("node.exe");
            let server = base
                .join(prefix)
                .join("server")
                .join("standalone");
            if node.is_file() && server.join("server.js").is_file() {
                return Some((node, server));
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = base;
    }
    None
}

#[cfg(not(debug_assertions))]
fn spawn_next_process(
    node_exe: &std::path::Path,
    server_dir: &std::path::Path,
    server_port: u16,
) -> Result<Child, std::io::Error> {
    use std::fs::OpenOptions;

    // Redirect Node.js stdout/stderr to log files so crash output is visible.
    let log_dir = init_log_dir();
    let stdout_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join("node-stdout.log"))?;
    let stderr_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join("node-stderr.log"))?;

    let server_js = server_dir.join("server.js");
    let mut cmd = Command::new(node_exe);
    cmd.arg(&server_js)
        .current_dir(server_dir)
        .env("PORT", server_port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("NODE_ENV", "production")
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout_file))
        .stderr(Stdio::from(stderr_file));

    // Teruskan env var yang dibutuhkan server Next.js (di-set lewat .env atau parent process).
    // SUPABASE_SERVICE_ROLE_KEY is intentionally omitted: RLS policies on the
    // remote database allow the public anon key to perform all operations the
    // desktop app requires, so the privileged key never needs to leave the server.
    for key in [
        "SESSION_SECRET",
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "DATABASE_URL",
        "SYNC_ENGINE_V2",
        "REALTIME_PULL_ENABLED",
        "WEB_SERVER_MEDIATED_ONLY",
        "SYNC_WAVE",
    ] {
        if let Ok(val) = std::env::var(key) {
            cmd.env(key, val);
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Sembunyikan jendela console; semua output masuk ke file log di atas.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    cmd.spawn()
}

/// Start the Next.js server. In release mode, returns the Child so we can kill it on exit.
#[cfg(not(debug_assertions))]
fn start_nextjs_server(app_handle: &tauri::AppHandle) -> Result<Option<Child>, Box<dyn std::error::Error>> {
    slog("=== Starting Next.js server (release) ===");
    slog(&format!("Log dir: {}", init_log_dir().display()));
    slog(&format!("Exe: {:?}", std::env::current_exe().ok()));

    if next_port_listening(BUNDLED_NEXT_PORT) {
        slog(&format!("Next.js already listening on port {BUNDLED_NEXT_PORT}"));
        return Ok(None);
    }

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|p| p.to_path_buf()));
    slog(&format!("Exe dir: {:?}", exe_dir));

    let mut node_exe: Option<PathBuf> = None;
    let mut server_dir: Option<PathBuf> = None;

    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        slog(&format!("Resource dir: {}", resource_dir.display()));
        if let Some((n, s)) = bundled_node_and_server(&resource_dir) {
            slog(&format!("Found bundled node: {}", n.display()));
            slog(&format!("Found bundled server: {}", s.display()));
            node_exe = Some(n);
            server_dir = Some(s);
        } else {
            slog("Bundled node/server NOT found in resource dir");
            for prefix in &["_up_/tauri-bundle", "tauri-bundle"] {
                let node_check = resource_dir
                    .join(prefix)
                    .join("node")
                    .join("node-v22.22.0-win-x64")
                    .join("node.exe");
                let srv_check = resource_dir
                    .join(prefix)
                    .join("server")
                    .join("standalone")
                    .join("server.js");
                slog(&format!("  [{prefix}] node: {} (exists: {})", node_check.display(), node_check.exists()));
                slog(&format!("  [{prefix}] server.js: {} (exists: {})", srv_check.display(), srv_check.exists()));
            }
        }
    } else {
        slog("Could not get resource dir from Tauri");
    }

    if node_exe.is_none() {
        if let Some(ref exe_path) = exe_dir {
            slog(&format!("Trying exe dir: {}", exe_path.display()));
            if let Some((n, s)) = bundled_node_and_server(exe_path) {
                slog(&format!("Found bundled node next to exe: {}", n.display()));
                node_exe = Some(n);
                server_dir = Some(s);
            } else {
                slog("Bundled node/server NOT found next to exe");
            }
        }
    }

    if node_exe.is_none() {
        if let Some(dir) = find_standalone_server_dir() {
            slog(&format!("Found standalone dir: {}", dir.display()));
            slog("Spawning via system 'node' command");
            let child = spawn_next_process(std::path::Path::new("node"), &dir, BUNDLED_NEXT_PORT)?;
            slog(&format!("Node process spawned (pid {})", child.id()));
            if !wait_for_port_listening(BUNDLED_NEXT_PORT, Duration::from_secs(30)) {
                slog(&format!("Port {BUNDLED_NEXT_PORT} not ready after 30s — loading page will keep polling"));
            } else {
                slog(&format!("Next.js ready on port {BUNDLED_NEXT_PORT} (system node)"));
            }
            return Ok(Some(child));
        }
    }

    if let (Some(node), Some(dir)) = (node_exe, server_dir) {
        // Strip \\?\ extended-length prefix: Next.js internal path-matching
        // regex breaks when __dirname starts with \\?\ instead of a drive letter.
        #[cfg(windows)]
        let (node, dir) = (strip_extended_prefix(node), strip_extended_prefix(dir));

        slog(&format!("Spawning: {} server.js in {}", node.display(), dir.display()));
        let child = spawn_next_process(&node, &dir, BUNDLED_NEXT_PORT)?;
        slog(&format!("Node process spawned (pid {})", child.id()));
        if !wait_for_port_listening(BUNDLED_NEXT_PORT, Duration::from_secs(30)) {
            slog(&format!("Port {BUNDLED_NEXT_PORT} not ready after 30s — loading page will keep polling"));
        } else {
            slog(&format!("Next.js ready on port {BUNDLED_NEXT_PORT} (bundled)"));
        }
        return Ok(Some(child));
    }

    slog("FATAL: Could not find Node.js or server.js anywhere.");
    slog("Ensure the build was done with 'build.bat' or 'npm run tauri:build'.");
    slog("The tauri-bundle directory must contain node/node-v22.22.0-win-x64/node.exe");
    slog("and server/standalone/server.js");
    Ok(None)
}

/// In dev mode, just wait for the CLI-started dev server.
#[cfg(debug_assertions)]
fn start_nextjs_server_dev() {
    if next_port_listening(DEV_TAURI_SHELL_PORT) {
        println!("Next dev server already on http://127.0.0.1:{DEV_TAURI_SHELL_PORT} (tauri dev)");
        return;
    }
    println!("Waiting for tauri dev Next on http://127.0.0.1:{DEV_TAURI_SHELL_PORT} …");
    if !wait_for_port_listening(DEV_TAURI_SHELL_PORT, Duration::from_secs(90)) {
        eprintln!("Timeout: port {DEV_TAURI_SHELL_PORT} (tauri dev shell) not ready.");
    }
}

fn load_env_file() {
    // 1. AppData config (user-writable, no admin rights needed; lowest priority so
    //    exe-dir config can override it).
    let appdata_env = init_log_dir().join(".env.local");
    if appdata_env.is_file() {
        slog(&format!("Loading env from {}", appdata_env.display()));
        let _ = dotenvy::from_path(&appdata_env);
    }

    // 2. Exe dir (highest priority — admin-placed config overrides AppData).
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    if let Some(ref dir) = exe_dir {
        for name in &[".env.local", ".env"] {
            let path = dir.join(name);
            if path.is_file() {
                slog(&format!("Loading env from {}", path.display()));
                let _ = dotenvy::from_path(&path);
                return;
            }
        }
    }

    // 3. CWD fallback (dev convenience).
    for name in &[".env.local", ".env"] {
        if std::path::Path::new(name).is_file() {
            slog(&format!("Loading env from cwd/{name}"));
            let _ = dotenvy::from_filename(name);
            return;
        }
    }

    if !appdata_env.is_file() {
        slog(&format!(
            "No .env file found — place .env.local in {} for Supabase/session config",
            init_log_dir().display()
        ));
    }
}

/// Ensure SESSION_SECRET is available for the Next.js server.
/// If not already set, auto-generates a random 256-bit hex secret and persists
/// it in the AppData config so it survives restarts without losing sessions.
fn ensure_session_secret() {
    if std::env::var("SESSION_SECRET").is_ok() {
        return;
    }

    // Buat memakai dua UUID: 128 bit × 2 = 256 bit randomness.
    let secret = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());

    let config_path = init_log_dir().join(".env.local");
    let existing = std::fs::read_to_string(&config_path).unwrap_or_default();
    if !existing.contains("SESSION_SECRET=") {
        let mut content = existing;
        if !content.is_empty() && !content.ends_with('\n') {
            content.push('\n');
        }
        content.push_str(&format!("SESSION_SECRET={secret}\n"));
        match std::fs::write(&config_path, &content) {
            Ok(_) => slog(&format!(
                "Auto-generated SESSION_SECRET saved to {}",
                config_path.display()
            )),
            Err(e) => slog(&format!(
                "Warning: could not save SESSION_SECRET ({}); session will reset on next start",
                e
            )),
        }
    }

    // Set untuk proses saat ini supaya diteruskan ke server Node.js.
    std::env::set_var("SESSION_SECRET", &secret);
    slog("SESSION_SECRET set (auto-generated)");
}

#[tauri::command]
fn get_server_log_path() -> String {
    init_log_dir().join("server.log").display().to_string()
}

#[cfg(windows)]
fn parse_windows_printers(stdout: &str) -> Result<Vec<PrinterInfo>, String> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let value: serde_json::Value = serde_json::from_str(trimmed).map_err(|e| e.to_string())?;
    let rows: Vec<serde_json::Value> = match value {
        serde_json::Value::Array(items) => items,
        item => vec![item],
    };

    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let name = row.get("Name")?.as_str()?.trim().to_string();
            if name.is_empty() {
                return None;
            }
            Some(PrinterInfo {
                name,
                driver: row
                    .get("DriverName")
                    .and_then(|v| v.as_str())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty()),
                port: row
                    .get("PortName")
                    .and_then(|v| v.as_str())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty()),
                status: row
                    .get("PrinterStatus")
                    .map(|v| v.to_string().trim_matches('"').to_string())
                    .filter(|s| !s.is_empty()),
                is_default: row
                    .get("Default")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false),
            })
        })
        .collect())
}

#[cfg(not(windows))]
fn parse_lpstat_printers(stdout: &str) -> Vec<PrinterInfo> {
    stdout
        .lines()
        .filter_map(|line| {
            let rest = line.strip_prefix("printer ")?;
            let name = rest.split_whitespace().next()?.trim().to_string();
            if name.is_empty() {
                return None;
            }
            Some(PrinterInfo {
                name,
                driver: None,
                port: None,
                status: Some(line.to_string()),
                is_default: false,
            })
        })
        .collect()
}

#[tauri::command]
fn list_system_printers() -> Result<Vec<PrinterInfo>, String> {
    #[cfg(windows)]
    {
        let output = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                "Get-CimInstance Win32_Printer | Select-Object Name,DriverName,PortName,Default,PrinterStatus | ConvertTo-Json -Depth 3",
            ])
            .output()
            .map_err(|e| format!("Tidak bisa membaca printer Windows: {e}"))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }

        return parse_windows_printers(&String::from_utf8_lossy(&output.stdout));
    }

    #[cfg(not(windows))]
    {
        let output = std::process::Command::new("lpstat")
            .args(["-p"])
            .output()
            .map_err(|e| format!("Tidak bisa membaca printer sistem: {e}"))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }

        Ok(parse_lpstat_printers(&String::from_utf8_lossy(&output.stdout)))
    }
}

fn main() {
    // Potong log kalau melebihi 1 MB
    let log_file = init_log_dir().join("server.log");
    if log_file.exists() {
        if let Ok(m) = std::fs::metadata(&log_file) {
            if m.len() > 1_000_000 {
                let _ = std::fs::write(&log_file, "");
            }
        }
    }

    slog("=== gemiprint starting ===");
    slog(&format!("Version: {}", env!("CARGO_PKG_VERSION")));
    slog(&format!("Exe: {:?}", std::env::current_exe().ok()));
    slog(&format!("CWD: {:?}", std::env::current_dir().ok()));

    load_env_file();
    ensure_session_secret();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let main_window = app
                .get_webview_window("main")
                .expect("define window label `main` in tauri.conf.json (see `app.windows`)");

            #[cfg(not(debug_assertions))]
            {
                match start_nextjs_server(app.handle()) {
                    Ok(child_opt) => {
                        app.manage(NextServerProcess(Mutex::new(child_opt)));
                    }
                    Err(e) => {
                        slog(&format!("start_nextjs_server error: {e}"));
                        app.manage(NextServerProcess(Mutex::new(None)));
                    }
                }
            }
            #[cfg(debug_assertions)]
            {
                start_nextjs_server_dev();
            }

            slog("Initializing database…");
            let conn = init_database(app.handle())?;
            slog("Database initialized");
            app.manage(AppState {
                db: Mutex::new(Some(conn)),
            });

            if let Err(e) = main_window.show() {
                eprintln!("failed to show main window: {e}");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db_query,
            db_query_one,
            db_insert,
            db_update,
            db_delete,
            db_execute,
            queue_sync_operation,
            count_pending_sync,
            sync_to_cloud,
            sync_from_cloud,
            get_server_log_path,
            list_system_printers,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            #[cfg(not(debug_assertions))]
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<NextServerProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(ref mut child) = *guard {
                            let pid = child.id();
                            slog(&format!("Shutting down Next.js server (pid {pid})…"));
                            // On Windows, use taskkill /F /T to force-terminate the entire
                            // process tree (node.exe + any workers it spawned).
                            #[cfg(windows)]
                            {
                                use std::os::windows::process::CommandExt;
                                let _ = std::process::Command::new("taskkill")
                                    .args(["/F", "/T", "/PID", &pid.to_string()])
                                    .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
                                    .output();
                            }
                            let _ = child.kill();
                            let _ = child.wait();
                            slog("Next.js server stopped.");
                        }
                    }
                }
            }
            #[cfg(debug_assertions)]
            {
                let _ = (app_handle, &event);
            }
        });
}
