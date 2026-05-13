// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod sync;

use rusqlite::{params, Connection, Result as SqlResult};
use std::io::Write;
use std::net::TcpStream;
use std::path::PathBuf;
#[cfg(not(debug_assertions))]
use std::process::{Child, Command};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Manager, State};
use uuid::Uuid;

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

// Initialize database connection
fn init_database(app_handle: &tauri::AppHandle) -> SqlResult<Connection> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .expect("Failed to get app data directory");
    
    // Create directory if it doesn't exist
    std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data directory");
    
    let db_path = app_data_dir.join("gemiprint.db");
    println!("Database path: {:?}", db_path);
    
    // Check if database doesn't exist yet (first run)
    let is_first_run = !db_path.exists();
    
    if is_first_run {
        println!("First run detected - copying template database...");
        
        // Embedded database template (from /database/gemiprint.db)
        let template_db = include_bytes!("../../database/gemiprint.db");
        
        // Write template to app data directory
        std::fs::write(&db_path, template_db)
            .expect("Failed to copy template database");
        
        println!("Template database copied successfully with admin user data");
    } else {
        println!("Using existing database");
    }
    
    let conn = Connection::open(db_path)?;
    
    // Enable foreign keys (doesn't return results)
    conn.execute("PRAGMA foreign_keys = ON", [])?;
    
    // Set WAL mode (returns results, need to use pragma_update or query_row)
    conn.pragma_update(None, "journal_mode", "WAL")?;
    
    // Initialize schema if needed
    init_schema(&conn)?;
    
    Ok(conn)
}

// Initialize database schema
fn init_schema(conn: &Connection) -> SqlResult<()> {
    // Check if database is already initialized
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
        
        // For development, just skip schema initialization if file has issues
        // Schema should be initialized manually or via migration tool
        println!("NOTE: Skipping automatic schema initialization.");
        println!("Please ensure database is initialized manually if needed.");
        
        // Uncomment below to force schema initialization:
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
        "piutang_penjualan",
        "pelunasan_piutang",
        "hutang_pembelian",
        "pelunasan_hutang",
        "order_produksi",
        "item_produksi",
        "item_finishing",
        "keuangan",
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

// Tauri command: Execute query and return all rows
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

// Tauri command: Execute query and return single row
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

// Tauri command: Insert record
#[tauri::command]
async fn db_insert(
    state: State<'_, AppState>,
    table: String,
    data: serde_json::Value,
) -> Result<String, String> {
    let db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;
    
    let obj = data.as_object().ok_or("Data must be an object")?;
    
    // Get or generate ID
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

// Tauri command: Update record
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

// Tauri command: Delete record
#[tauri::command]
async fn db_delete(
    state: State<'_, AppState>,
    table: String,
    id: String,
) -> Result<(), String> {
    let db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;
    
    let sql = format!("DELETE FROM {} WHERE id = ?", table);
    
    conn.execute(&sql, params![id])
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

// Tauri command: Execute non-query SQL (for updates, deletes, etc.)
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

// Helper for base64 encoding (simple implementation)
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

// Sync operations - Queue for background sync to Supabase
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
    
    // Insert sync operation
    let id = Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().to_rfc3339();
    
    conn.execute(
        "INSERT INTO sync_queue (id, table_name, operation, record_id, data, created_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, table, operation, record_id, data, created_at],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

// Count pending sync operations
#[tauri::command]
async fn count_pending_sync(
    state: State<'_, AppState>,
) -> Result<i64, String> {
    let db_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;
    
    // Check if sync_queue table exists
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
    
    // Count pending operations
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sync_queue WHERE synced_at IS NULL",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    
    Ok(count)
}

// Sync to cloud - Process pending sync operations
#[tauri::command]
async fn sync_to_cloud(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // Step 1: Get operations from DB (synchronous, with lock)
    let operations = {
        let db_guard = state.db.lock().map_err(|e| e.to_string())?;
        let conn = db_guard.as_ref().ok_or("Database not initialized")?;
        
        // Check if sync_queue table exists
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
        
        // Get operations
        sync::get_operations_for_sync(conn)?
    }; // Lock released here
    
    if operations.is_empty() {
        return Ok(serde_json::json!({
            "synced": 0,
            "failed": 0,
            "message": "No pending operations"
        }));
    }
    
    // Try to get Supabase config
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
    let server_js = server_dir.join("server.js");
    let mut cmd = Command::new(node_exe);
    cmd.arg(&server_js)
        .current_dir(server_dir)
        .env("PORT", server_port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("NODE_ENV", "production");

    // Forward env vars the Next.js server needs (set via .env or parent process).
    for key in [
        "SESSION_SECRET",
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
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
            if !wait_for_port_listening(BUNDLED_NEXT_PORT, Duration::from_secs(10)) {
                slog(&format!("Port {BUNDLED_NEXT_PORT} not ready after 10s — loading page will keep polling"));
            } else {
                slog(&format!("Next.js ready on port {BUNDLED_NEXT_PORT} (system node)"));
            }
            return Ok(Some(child));
        }
    }

    if let (Some(node), Some(dir)) = (node_exe, server_dir) {
        slog(&format!("Spawning: {} server.js in {}", node.display(), dir.display()));
        let child = spawn_next_process(&node, &dir, BUNDLED_NEXT_PORT)?;
        slog(&format!("Node process spawned (pid {})", child.id()));
        if !wait_for_port_listening(BUNDLED_NEXT_PORT, Duration::from_secs(10)) {
            slog(&format!("Port {BUNDLED_NEXT_PORT} not ready after 10s — loading page will keep polling"));
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
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    let candidates = [".env.local", ".env"];

    if let Some(ref dir) = exe_dir {
        for name in &candidates {
            let path = dir.join(name);
            if path.is_file() {
                slog(&format!("Loading env from {}", path.display()));
                let _ = dotenvy::from_path(&path);
                return;
            }
        }
    }

    for name in &candidates {
        if std::path::Path::new(name).is_file() {
            slog(&format!("Loading env from cwd/{name}"));
            let _ = dotenvy::from_filename(name);
            return;
        }
    }

    slog("No .env file found (optional)");
}

#[tauri::command]
fn get_server_log_path() -> String {
    init_log_dir().join("server.log").display().to_string()
}

fn main() {
    // Truncate log if it exceeds 1 MB
    let log_file = init_log_dir().join("server.log");
    if log_file.exists() {
        if let Ok(m) = std::fs::metadata(&log_file) {
            if m.len() > 1_000_000 {
                let _ = std::fs::write(&log_file, "");
            }
        }
    }

    slog("=== GemiPrint starting ===");
    slog(&format!("Version: {}", env!("CARGO_PKG_VERSION")));
    slog(&format!("Exe: {:?}", std::env::current_exe().ok()));
    slog(&format!("CWD: {:?}", std::env::current_dir().ok()));

    load_env_file();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
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
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            #[cfg(not(debug_assertions))]
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<NextServerProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(ref mut child) = *guard {
                            println!("Shutting down Next.js server (pid {})…", child.id());
                            let _ = child.kill();
                            let _ = child.wait();
                            println!("Next.js server stopped.");
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
