// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod sync;

use rusqlite::{params, Connection, Result as SqlResult};
use std::sync::Mutex;
use tauri::{Manager, State};
use uuid::Uuid;

// Database state
struct AppState {
    db: Mutex<Option<Connection>>,
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
            status TEXT DEFAULT 'pending'
        )",
        [],
    ).map_err(|e| e.to_string())?;
    
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

// Start Next.js server in background
fn start_nextjs_server(app_handle: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use std::process::Command;
    use std::env;
    
    // Try to find Node.js in multiple locations:
    // 1. Next to the executable (distribution package)
    // 2. In resources directory (if bundled)
    // 3. System PATH (development)
    
    let exe_dir = env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|p| p.to_path_buf()));
    
    let mut node_exe = None;
    let mut server_dir = None;
    
    // Check next to executable (distribution package)
    if let Some(ref exe_path) = exe_dir {
        let bundle_node = exe_path.join("tauri-bundle").join("node").join("node-v20.18.1-win-x64").join("node.exe");
        let bundle_server = exe_path.join("tauri-bundle").join("server").join("standalone");
        
        if bundle_node.exists() && bundle_server.join("server.js").exists() {
            node_exe = Some(bundle_node);
            server_dir = Some(bundle_server);
            println!("✓ Found portable bundle next to executable");
        }
    }
    
    // Check in resources directory
    if node_exe.is_none() {
        let resource_dir = app_handle
            .path()
            .resource_dir()
            .expect("Failed to get resource directory");
        
        let res_node = resource_dir.join("tauri-bundle").join("node").join("node-v20.18.1-win-x64").join("node.exe");
        let res_server = resource_dir.join("tauri-bundle").join("server").join("standalone");
        
        if res_node.exists() && res_server.join("server.js").exists() {
            node_exe = Some(res_node);
            server_dir = Some(res_server);
            println!("✓ Found portable bundle in resources");
        }
    }
    
    // If not found, assume server is already running
    if node_exe.is_none() || server_dir.is_none() {
        println!("⚠️  Portable Node.js bundle not found");
        println!("   Assuming Next.js server is already running on port 3000");
        return Ok(());
    }
    
    let node_exe = node_exe.unwrap();
    let server_dir = server_dir.unwrap();
    let server_js = server_dir.join("server.js");
    
    println!("🚀 Starting Next.js server...");
    println!("   Node: {:?}", node_exe);
    println!("   Server: {:?}", server_js);
    
    // Start Node.js server as detached process
    Command::new(node_exe)
        .arg(server_js)
        .current_dir(&server_dir)
        .spawn()
        .expect("Failed to start Next.js server");
    
    println!("✅ Next.js server started!");
    
    // Wait a bit for server to initialize
    std::thread::sleep(std::time::Duration::from_secs(2));
    
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        // Note: updater plugin requires configuration, disabled for now
        // .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Start Next.js server first
            if let Err(e) = start_nextjs_server(app.handle()) {
                println!("⚠️  Failed to start Next.js server: {}", e);
                println!("   Assuming server is already running...");
            }
            
            // Initialize database
            let conn = init_database(app.handle())?;
            
            // Store database connection in state
            app.manage(AppState {
                db: Mutex::new(Some(conn)),
            });

            // Handle window close event to clear localStorage
            let main_window = app.get_webview_window("main").unwrap();
            main_window.on_window_event(|event| {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    // Emit event to frontend to clear localStorage before closing
                    println!("Window close requested - clearing user session");
                }
            });
            
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
