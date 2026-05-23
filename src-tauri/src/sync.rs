use rusqlite::Connection;
use serde_json::Value;
use std::env;
use rusqlite::types::Value as SqlValue;
use std::collections::HashSet;

/// Supabase sync configuration
pub struct SupabaseConfig {
    pub url: String,
    pub anon_key: String,
}

impl SupabaseConfig {
    /// Load from environment variables
    pub fn from_env() -> Option<Self> {
        let url = env::var("NEXT_PUBLIC_SUPABASE_URL").ok()?;
        let anon_key = env::var("NEXT_PUBLIC_SUPABASE_ANON_KEY").ok()?;
        
        Some(Self { url, anon_key })
    }
}

/// Sync operation from queue
#[derive(Debug)]
pub struct SyncOperation {
    pub id: String,
    pub table_name: String,
    pub operation: String,
    pub record_id: Option<String>,
    pub data: Option<String>,
}

/// Result of sync operation
#[derive(Debug)]
pub struct SyncResult {
    pub synced: i32,
    pub failed: i32,
}

pub struct PullResult {
    pub pulled: i32,
    pub failed: i32,
}

fn parse_sync_tables_allowlist() -> Option<HashSet<String>> {
    let raw = env::var("SYNC_TABLES_ALLOWLIST").ok()?;
    let list: HashSet<String> = raw
        .split(',')
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .collect();
    if list.is_empty() {
        None
    } else {
        Some(list)
    }
}

fn is_table_allowed(table_name: &str, allowlist: &Option<HashSet<String>>) -> bool {
    match allowlist {
        Some(set) => set.contains(table_name),
        None => true,
    }
}

/// Sync pending operations to Supabase
/// Returns operations data for async processing
pub fn get_operations_for_sync(conn: &Connection) -> Result<Vec<SyncOperation>, String> {
    get_pending_operations(conn)
}

/// Process sync operations (async, no DB connection needed)
pub async fn process_sync_operations(
    operations: Vec<SyncOperation>,
    config: &SupabaseConfig,
) -> Vec<(String, Result<(), String>)> {
    if operations.is_empty() {
        return Vec::new();
    }
    
    let mut results = Vec::new();
    let client = reqwest::Client::new();
    let allowlist = parse_sync_tables_allowlist();
    if let Some(list) = &allowlist {
        println!("🔒 SYNC_TABLES_ALLOWLIST active for push: {:?}", list);
    }

    for op in operations {
        if !is_table_allowed(&op.table_name, &allowlist) {
            println!("⏭️ Push skipped (allowlist): {}", op.table_name);
            continue;
        }
        let op_id = op.id.clone();
        let result = sync_single_operation(&client, config, &op).await;
        results.push((op_id, result));
    }
    
    results
}

/// Update sync status in database
pub fn update_sync_status(
    conn: &Connection,
    results: Vec<(String, Result<(), String>)>,
) -> Result<SyncResult, String> {
    let mut synced = 0;
    let mut failed = 0;
    
    for (op_id, result) in results {
        match result {
            Ok(_) => {
                if mark_as_synced(conn, &op_id).is_ok() {
                    synced += 1;
                } else {
                    failed += 1;
                }
            }
            Err(e) => {
                mark_as_failed(conn, &op_id, &e).ok();
                failed += 1;
            }
        }
    }
    
    Ok(SyncResult { synced, failed })
}

/// Get pending operations from sync_queue
fn get_pending_operations(conn: &Connection) -> Result<Vec<SyncOperation>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, table_name, operation, record_id, data 
             FROM sync_queue 
             WHERE synced_at IS NULL AND status != 'failed'
             ORDER BY created_at ASC 
             LIMIT 50"
        )
        .map_err(|e| e.to_string())?;
    
    let operations = stmt
        .query_map([], |row| {
            Ok(SyncOperation {
                id: row.get(0)?,
                table_name: row.get(1)?,
                operation: row.get(2)?,
                record_id: row.get(3)?,
                data: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    
    Ok(operations)
}

/// Sync single operation to Supabase
async fn sync_single_operation(
    client: &reqwest::Client,
    config: &SupabaseConfig,
    op: &SyncOperation,
) -> Result<(), String> {
    let url = format!("{}/rest/v1/{}", config.url, op.table_name);
    
    match op.operation.as_str() {
        "insert" => {
            let data: Value = serde_json::from_str(op.data.as_ref().ok_or("No data for insert")?)
                .map_err(|e| e.to_string())?;
            let record_id = data
                .get("id")
                .and_then(|v| v.as_str())
                .ok_or("No id for insert")?;
            if let Some(remote) = fetch_remote_row(client, config, &op.table_name, record_id).await? {
                if !should_apply_local_over_remote(&data, &remote) {
                    log_conflict(client, config, &op.table_name, record_id, &remote, &data, "remote", "local").await?;
                    return Ok(());
                }
            }
            
            let response = client
                .post(&url)
                .header("apikey", &config.anon_key)
                .header("Authorization", format!("Bearer {}", config.anon_key))
                .header("Content-Type", "application/json")
                .header("Prefer", "return=minimal")
                .json(&data)
                .send()
                .await
                .map_err(|e| e.to_string())?;
            
            if !response.status().is_success() {
                let error_text = response.text().await.unwrap_or_default();
                return Err(format!("Insert failed: {}", error_text));
            }
        }
        
        "update" => {
            let record_id = op.record_id.as_ref().ok_or("No record_id for update")?;
            let data: Value = serde_json::from_str(op.data.as_ref().ok_or("No data for update")?)
                .map_err(|e| e.to_string())?;
            if let Some(remote) = fetch_remote_row(client, config, &op.table_name, record_id).await? {
                if !should_apply_local_over_remote(&data, &remote) {
                    log_conflict(client, config, &op.table_name, record_id, &remote, &data, "remote", "local").await?;
                    return Ok(());
                }
            }
            
            let update_url = format!("{}?id=eq.{}", url, record_id);
            
            let response = client
                .patch(&update_url)
                .header("apikey", &config.anon_key)
                .header("Authorization", format!("Bearer {}", config.anon_key))
                .header("Content-Type", "application/json")
                .header("Prefer", "return=minimal")
                .json(&data)
                .send()
                .await
                .map_err(|e| e.to_string())?;
            
            if !response.status().is_success() {
                let error_text = response.text().await.unwrap_or_default();
                return Err(format!("Update failed: {}", error_text));
            }
        }
        
        "delete" => {
            let record_id = op.record_id.as_ref().ok_or("No record_id for delete")?;
            let delete_url = format!("{}?id=eq.{}", url, record_id);
            
            let response = client
                .delete(&delete_url)
                .header("apikey", &config.anon_key)
                .header("Authorization", format!("Bearer {}", config.anon_key))
                .header("Prefer", "return=minimal")
                .send()
                .await
                .map_err(|e| e.to_string())?;
            
            if !response.status().is_success() {
                let error_text = response.text().await.unwrap_or_default();
                return Err(format!("Delete failed: {}", error_text));
            }
        }
        
        _ => return Err(format!("Unknown operation: {}", op.operation)),
    }
    
    Ok(())
}

fn should_apply_local_over_remote(local: &Value, remote: &Value) -> bool {
    let local_ts = local
        .get("updated_at_server")
        .and_then(|v| v.as_str())
        .unwrap_or("1970-01-01T00:00:00Z");
    let remote_ts = remote
        .get("updated_at_server")
        .and_then(|v| v.as_str())
        .unwrap_or("1970-01-01T00:00:00Z");

    if local_ts > remote_ts {
        return true;
    }
    if local_ts < remote_ts {
        return false;
    }

    let local_device = local
        .get("updated_by_device")
        .and_then(|v| v.as_str())
        .unwrap_or("z-local");
    let remote_device = remote
        .get("updated_by_device")
        .and_then(|v| v.as_str())
        .unwrap_or("a-remote");
    local_device >= remote_device
}

async fn fetch_remote_row(
    client: &reqwest::Client,
    config: &SupabaseConfig,
    table_name: &str,
    record_id: &str,
) -> Result<Option<Value>, String> {
    let url = format!(
        "{}/rest/v1/{}?select=*&id=eq.{}&limit=1",
        config.url,
        table_name,
        urlencoding::encode(record_id)
    );
    let response = client
        .get(&url)
        .header("apikey", &config.anon_key)
        .header("Authorization", format!("Bearer {}", config.anon_key))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Ok(None);
    }
    let rows: Vec<Value> = response.json().await.map_err(|e| e.to_string())?;
    Ok(rows.into_iter().next())
}

async fn log_conflict(
    client: &reqwest::Client,
    config: &SupabaseConfig,
    table_name: &str,
    record_id: &str,
    winner_payload: &Value,
    loser_payload: &Value,
    winner_source: &str,
    loser_source: &str,
) -> Result<(), String> {
    let url = format!("{}/rest/v1/sync_conflicts", config.url);
    let payload = serde_json::json!({
      "table_name": table_name,
      "record_id": record_id,
      "conflict_type": "lww",
      "winner_source": winner_source,
      "loser_source": loser_source,
      "winner_payload": winner_payload,
      "loser_payload": loser_payload,
      "winner_updated_at_server": winner_payload.get("updated_at_server"),
      "loser_updated_at_server": loser_payload.get("updated_at_server")
    });

    let response = client
      .post(&url)
      .header("apikey", &config.anon_key)
      .header("Authorization", format!("Bearer {}", config.anon_key))
      .header("Content-Type", "application/json")
      .header("Prefer", "return=minimal")
      .json(&payload)
      .send()
      .await
      .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
      return Err(format!("Failed to log conflict: {}", response.status()));
    }
    Ok(())
}

/// Mark operation as synced
fn mark_as_synced(conn: &Connection, op_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE sync_queue SET synced_at = ?1, status = 'synced' WHERE id = ?2",
        rusqlite::params![chrono::Utc::now().to_rfc3339(), op_id],
    )
    .map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Mark operation as failed
fn mark_as_failed(conn: &Connection, op_id: &str, error: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE sync_queue SET status = 'failed', error_message = ?1 WHERE id = ?2",
        rusqlite::params![error, op_id],
    )
    .map_err(|e| e.to_string())?;
    
    Ok(())
}

const WAVE1_TABLES: &[&str] = &[
    "penjualan",
    "item_penjualan",
    "pembelian",
    "item_pembelian",
    "inventory_movements",
    "keuangan",
    // Authentication-critical tables must always sync even at wave 1.
    "profil",
    "kredensial",
];

const WAVE2_TABLES: &[&str] = &[
    "piutang_penjualan",
    "pelunasan_piutang",
    "hutang_pembelian",
    "pelunasan_hutang",
];

const WAVE3_TABLES: &[&str] = &[
    "barang",
    "harga_barang_satuan",
    "pelanggan",
    "vendor",
    "kategori_barang",
    "subkategori_barang",
    "satuan_barang",
    "spesifikasi_cepat_barang",
    "opsi_finishing",
];

fn active_sync_tables() -> HashSet<String> {
    let wave = env::var("SYNC_WAVE").unwrap_or_else(|_| "1".to_string());
    let mut tables: Vec<&str> = Vec::new();

    match wave.as_str() {
        "3" => {
            tables.extend(WAVE1_TABLES);
            tables.extend(WAVE2_TABLES);
            tables.extend(WAVE3_TABLES);
        }
        "2" => {
            tables.extend(WAVE1_TABLES);
            tables.extend(WAVE2_TABLES);
        }
        _ => {
            tables.extend(WAVE1_TABLES);
        }
    }

    tables.into_iter().map(|t| t.to_string()).collect()
}

fn discover_pull_tables(conn: &Connection) -> HashSet<String> {
    let mut tables = active_sync_tables();
    let internal_tables: HashSet<&str> = HashSet::from([
        "sqlite_sequence",
        "sync_queue",
        "sync_state",
        "sync_conflicts",
        "sync_mutation_registry",
        "device_registry",
    ]);

    if let Ok(mut stmt) = conn.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ) {
        if let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) {
            for row in rows.flatten() {
                if !internal_tables.contains(row.as_str()) {
                    tables.insert(row);
                }
            }
        }
    }

    tables
}

fn should_verify_counts() -> bool {
    env::var("SYNC_VERIFY_COUNTS").map(|v| v == "1").unwrap_or(false)
}

fn fetch_remote_table_count(
    client: &reqwest::blocking::Client,
    config: &SupabaseConfig,
    table_name: &str,
) -> Result<i64, String> {
    let url = format!(
        "{}/rest/v1/{}?select=id&limit=1",
        config.url, table_name
    );

    let response = client
        .get(&url)
        .header("apikey", &config.anon_key)
        .header("Authorization", format!("Bearer {}", config.anon_key))
        .header("Prefer", "count=exact")
        .send()
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "Count check failed for {}: {}",
            table_name,
            response.status()
        ));
    }

    // Content-Range format: "0-0/123" or "*/0"
    let content_range = response
        .headers()
        .get("content-range")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("*/0");
    let total = content_range
        .split('/')
        .nth(1)
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);
    Ok(total)
}

fn fetch_local_table_count(conn: &Connection, table_name: &str) -> Result<i64, String> {
    let sql = format!("SELECT COUNT(*) FROM {}", table_name);
    let count: i64 = conn
        .query_row(&sql, [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(count)
}

pub fn pull_cloud_changes(conn: &Connection, config: &SupabaseConfig) -> Result<PullResult, String> {
    ensure_sync_state_table(conn)?;
    let mut pulled = 0;
    let mut failed = 0;
    let cursor = get_last_pull_cursor(conn)?;
    let client = reqwest::blocking::Client::new();

    let mut pull_tables = discover_pull_tables(conn);
    let allowlist = parse_sync_tables_allowlist();
    if let Some(list) = &allowlist {
        println!("🔒 SYNC_TABLES_ALLOWLIST active for pull: {:?}", list);
        pull_tables.retain(|table| list.contains(table));
    }

    let verify_counts = should_verify_counts();
    if verify_counts {
        println!("🧪 SYNC_VERIFY_COUNTS active: row count checks enabled");
    }

    for table_name in pull_tables {
        match pull_table_since_cursor(conn, &client, config, &table_name, &cursor) {
            Ok(count) => {
                pulled += count;
                println!("✅ Pull {}: {} row(s) applied", table_name, count);
                if verify_counts {
                    match (
                        fetch_remote_table_count(&client, config, &table_name),
                        fetch_local_table_count(conn, &table_name),
                    ) {
                        (Ok(remote_count), Ok(local_count)) => {
                            if remote_count == local_count {
                                println!(
                                    "🟢 Verify {}: remote={} local={} (match)",
                                    table_name, remote_count, local_count
                                );
                            } else {
                                println!(
                                    "🟠 Verify {}: remote={} local={} (mismatch)",
                                    table_name, remote_count, local_count
                                );
                            }
                        }
                        (Err(e), _) | (_, Err(e)) => {
                            println!("⚠️ Verify {} skipped: {}", table_name, e);
                        }
                    }
                }
            }
            Err(e) => {
                // Skip tables that are local-only or not exposed on Supabase.
                if e.contains("404") || e.contains("PGRST") {
                    println!("⏭️ Pull {} skipped: {}", table_name, e);
                    continue;
                }
                println!("❌ Pull {} failed: {}", table_name, e);
                failed += 1;
            },
        }
    }

    set_last_pull_cursor(conn, &chrono::Utc::now().to_rfc3339())?;
    Ok(PullResult { pulled, failed })
}

fn ensure_sync_state_table(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn get_last_pull_cursor(conn: &Connection) -> Result<String, String> {
    let row: Option<String> = conn
        .query_row(
            "SELECT value FROM sync_state WHERE key = 'last_pull_cursor'",
            [],
            |row| row.get(0),
        )
        .ok();
    Ok(row.unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string()))
}

fn set_last_pull_cursor(conn: &Connection, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO sync_state(key, value, updated_at) VALUES('last_pull_cursor', ?1, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        rusqlite::params![value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn pull_table_since_cursor(
    conn: &Connection,
    client: &reqwest::blocking::Client,
    config: &SupabaseConfig,
    table_name: &str,
    cursor: &str,
) -> Result<i32, String> {
    let is_initial_pull = cursor == "1970-01-01T00:00:00Z";
    let url = if is_initial_pull {
        // Initial pull should hydrate full local SQLite snapshot from cloud.
        format!(
            "{}/rest/v1/{}?select=*&order=updated_at_server.asc.nullslast&limit=1000",
            config.url, table_name
        )
    } else {
        format!(
            "{}/rest/v1/{}?select=*&updated_at_server=gt.{}&order=updated_at_server.asc&limit=1000",
            config.url,
            table_name,
            urlencoding::encode(cursor)
        )
    };

    let response = client
        .get(&url)
        .header("apikey", &config.anon_key)
        .header("Authorization", format!("Bearer {}", config.anon_key))
        .send()
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Pull failed for {}: {}", table_name, response.status()));
    }

    let rows: Vec<Value> = response.json().map_err(|e| e.to_string())?;
    let mut applied = 0;
    for row in rows {
        if apply_cloud_row(conn, table_name, &row).is_ok() {
            applied += 1;
        }
    }
    Ok(applied)
}

fn apply_cloud_row(conn: &Connection, table_name: &str, row: &Value) -> Result<(), String> {
    let obj = row.as_object().ok_or("Invalid row object")?;
    let is_deleted = obj
        .get("is_deleted")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let record_id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Missing id")?;

    if is_deleted {
        let sql = format!("DELETE FROM {} WHERE id = ?1", table_name);
        conn.execute(&sql, rusqlite::params![record_id])
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    let columns: Vec<String> = obj.keys().cloned().collect();
    let placeholders = (0..columns.len())
        .map(|_| "?".to_string())
        .collect::<Vec<String>>()
        .join(", ");
    let sql = format!(
        "INSERT OR REPLACE INTO {} ({}) VALUES ({})",
        table_name,
        columns.join(", "),
        placeholders
    );

    let values: Vec<SqlValue> = columns
        .iter()
        .map(|c| json_to_sql_value(obj.get(c).unwrap_or(&Value::Null)))
        .collect();

    conn.execute(&sql, rusqlite::params_from_iter(values.iter()))
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn json_to_sql_value(value: &Value) -> SqlValue {
    match value {
        Value::Null => SqlValue::Null,
        Value::Bool(v) => SqlValue::Integer(if *v { 1 } else { 0 }),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                SqlValue::Integer(i)
            } else if let Some(f) = n.as_f64() {
                SqlValue::Real(f)
            } else {
                SqlValue::Null
            }
        }
        Value::String(s) => SqlValue::Text(s.clone()),
        Value::Array(_) | Value::Object(_) => SqlValue::Text(value.to_string()),
    }
}
