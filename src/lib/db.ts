/**
 * Database Abstraction Layer
 * Supports both SQLite (offline) and Supabase (online) modes
 */

import { supabase } from "./supabase";
import * as sqlite from "./sqlite-db";

// Database mode configuration
export const DB_MODE = process.env.NEXT_PUBLIC_DB_MODE || "hybrid"; // 'sqlite' | 'supabase' | 'hybrid'
export const USE_OFFLINE_FIRST = DB_MODE === "sqlite" || DB_MODE === "hybrid";

/**
 * Generic database interface
 */
export interface DatabaseAdapter {
  query<T>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T>(sql: string, params?: any[]): Promise<T | null>;
  insert(table: string, data: Record<string, any>): Promise<string>;
  update(table: string, id: string, data: Record<string, any>): Promise<void>;
  delete(table: string, id: string): Promise<void>;
}

/**
 * SQLite adapter for offline operations
 */
class SQLiteAdapter implements DatabaseAdapter {
  async query<T>(sql: string, params: any[] = []): Promise<T[]> {
    return sqlite.query<T>(sql, params);
  }

  async queryOne<T>(sql: string, params: any[] = []): Promise<T | null> {
    return sqlite.queryOne<T>(sql, params) || null;
  }

  async insert(table: string, data: Record<string, any>): Promise<string> {
    return sqlite.insert(table, data);
  }

  async update(
    table: string,
    id: string,
    data: Record<string, any>
  ): Promise<void> {
    sqlite.update(table, id, data);
  }

  async delete(table: string, id: string): Promise<void> {
    sqlite.deleteRecord(table, id);
  }
}

/**
 * Supabase adapter for online operations
 */
class SupabaseAdapter implements DatabaseAdapter {
  async query<T>(sql: string, params: any[] = []): Promise<T[]> {
    // Supabase uses ORM, not raw SQL
    throw new Error("Raw SQL queries not supported in Supabase adapter");
  }

  async queryOne<T>(sql: string, params: any[] = []): Promise<T | null> {
    throw new Error("Raw SQL queries not supported in Supabase adapter");
  }

  async insert(table: string, data: Record<string, any>): Promise<string> {
    const { data: result, error } = await supabase
      .from(table)
      .insert(data)
      .select("id")
      .single();

    if (error) throw error;
    return result.id;
  }

  async update(
    table: string,
    id: string,
    data: Record<string, any>
  ): Promise<void> {
    const { error } = await supabase.from(table).update(data).eq("id", id);

    if (error) throw error;
  }

  async delete(table: string, id: string): Promise<void> {
    const { error } = await supabase.from(table).delete().eq("id", id);

    if (error) throw error;
  }
}

/**
 * Get appropriate database adapter based on mode
 */
export function getDbAdapter(): DatabaseAdapter {
  if (typeof window !== "undefined") {
    // Client-side: always use API routes
    throw new Error("Database operations should be done server-side");
  }

  if (USE_OFFLINE_FIRST) {
    return new SQLiteAdapter();
  } else {
    return new SupabaseAdapter();
  }
}

/**
 * Helper functions for common operations
 */

// Materials
export async function getMaterials() {
  if (USE_OFFLINE_FIRST) {
    return sqlite.query("SELECT * FROM materials ORDER BY name");
  } else {
    const { data, error } = await supabase
      .from("materials")
      .select("*")
      .order("name");
    if (error) throw error;
    return data;
  }
}

export async function getMaterialById(id: string) {
  if (USE_OFFLINE_FIRST) {
    return sqlite.queryOne("SELECT * FROM materials WHERE id = ?", [id]);
  } else {
    const { data, error } = await supabase
      .from("materials")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  }
}

export async function createMaterial(material: any) {
  const adapter = getDbAdapter();
  return adapter.insert("materials", {
    id: sqlite.generateId(),
    ...material,
    created_at: sqlite.getCurrentTimestamp(),
    updated_at: sqlite.getCurrentTimestamp(),
  });
}

export async function updateMaterial(id: string, material: any) {
  const adapter = getDbAdapter();
  return adapter.update("materials", id, material);
}

export async function deleteMaterial(id: string) {
  const adapter = getDbAdapter();
  return adapter.delete("materials", id);
}

// Customers
export async function getCustomers() {
  if (USE_OFFLINE_FIRST) {
    return sqlite.query("SELECT * FROM customers ORDER BY name");
  } else {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("name");
    if (error) throw error;
    return data;
  }
}

export async function createCustomer(customer: any) {
  const adapter = getDbAdapter();
  return adapter.insert("customers", {
    id: sqlite.generateId(),
    ...customer,
    created_at: sqlite.getCurrentTimestamp(),
    updated_at: sqlite.getCurrentTimestamp(),
  });
}

// Vendors
export async function getVendors() {
  if (USE_OFFLINE_FIRST) {
    return sqlite.query("SELECT * FROM vendors ORDER BY name");
  } else {
    const { data, error } = await supabase
      .from("vendors")
      .select("*")
      .order("name");
    if (error) throw error;
    return data;
  }
}

// Sales
export async function getSales() {
  if (USE_OFFLINE_FIRST) {
    return sqlite.query("SELECT * FROM sales ORDER BY created_at DESC");
  } else {
    const { data, error } = await supabase
      .from("sales")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }
}

export async function createSale(sale: any, items: any[]) {
  if (USE_OFFLINE_FIRST) {
    const db = sqlite.getDatabase();
    const saleId = sqlite.generateId();

    // Use transaction for atomic operation
    const transaction = db.transaction(() => {
      // Insert sale
      sqlite.insert("sales", {
        id: saleId,
        ...sale,
        created_at: sqlite.getCurrentTimestamp(),
        updated_at: sqlite.getCurrentTimestamp(),
      });

      // Insert sale items
      for (const item of items) {
        sqlite.insert("sales_items", {
          id: sqlite.generateId(),
          sale_id: saleId,
          ...item,
          created_at: sqlite.getCurrentTimestamp(),
        });

        // Update material stock
        db.prepare(
          `
          UPDATE materials 
          SET stock_quantity = stock_quantity - ? 
          WHERE id = ?
        `
        ).run(item.quantity, item.material_id);
      }
    });

    transaction();
    return saleId;
  } else {
    // Supabase transaction
    const { data: saleData, error: saleError } = await supabase
      .from("sales")
      .insert(sale)
      .select()
      .single();

    if (saleError) throw saleError;

    const { error: itemsError } = await supabase
      .from("sales_items")
      .insert(items.map((item) => ({ ...item, sale_id: saleData.id })));

    if (itemsError) throw itemsError;

    return saleData.id;
  }
}

// Sync status
export function getSyncStatus() {
  if (USE_OFFLINE_FIRST) {
    return {
      mode: "offline-first",
      pendingChanges: sqlite.getTotalPendingChanges(),
      metadata: sqlite.getSyncMetadata(),
    };
  } else {
    return {
      mode: "online-only",
      pendingChanges: 0,
      metadata: [],
    };
  }
}
