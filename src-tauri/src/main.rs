// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
