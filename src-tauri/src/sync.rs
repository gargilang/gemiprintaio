use rusqlite::Connection;
use serde_json::Value;
use std::env;

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

/// Sync pending operations to Supabase
pub async fn sync_to_supabase(
    conn: &Connection,
    config: &SupabaseConfig,
) -> Result<SyncResult, String> {
    // Get pending operations
    let operations = get_pending_operations(conn)?;
    
    if operations.is_empty() {
        return Ok(SyncResult { synced: 0, failed: 0 });
    }
    
    let mut synced = 0;
    let mut failed = 0;
    
    // Create HTTP client
    let client = reqwest::Client::new();
    
    for op in operations {
        match sync_single_operation(&client, config, &op).await {
            Ok(_) => {
                // Mark as synced
                if mark_as_synced(conn, &op.id).is_ok() {
                    synced += 1;
                    println!("✓ Synced {} on {}", op.operation, op.table_name);
                } else {
                    failed += 1;
                }
            }
            Err(e) => {
                // Mark as failed
                mark_as_failed(conn, &op.id, &e).ok();
                failed += 1;
                println!("✗ Failed to sync {}: {}", op.id, e);
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
        "UPDATE sync_queue SET status = 'failed', synced_at = ?1 WHERE id = ?2",
        rusqlite::params![error, op_id],
    )
    .map_err(|e| e.to_string())?;
    
    Ok(())
}
