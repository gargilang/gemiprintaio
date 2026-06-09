/**
 * SQLite client helpers (server-side only)
 *
 * Extracted from db-unified.ts. Contains:
 *   - SQLite connection singleton (getServerSQLite)
 *   - All runtime schema migrations (ensure* functions)
 *   - SQLite column introspection cache
 *
 * IMPORTANT: do NOT import from db-unified.ts here - would be circular.
 */

import "server-only";

// Re-imported from db-supabase to avoid circular dependency
import { isBrowser, isServerSide } from "./db-supabase";

export { isBrowser, isServerSide };

// Columns cache used only by SQLite introspection

/**
 * Server-side SQLite mirror gating.
 * Vercel / plain Node dev: skip. Tauri sidecar: allow.
 */
function skipServerSqliteMirror(): boolean {
  if (process.env.GEMIPRINT_SKIP_SERVER_SQLITE_MIRROR === "1") return true;
  if (process.env.GEMIPRINT_ENABLE_SERVER_SQLITE_MIRROR === "1") return false;
  if (process.env.TAURI === "true" || process.env.TAURI === "1") return false;
  return true;
}

let serverSqliteDb: any = null;
export const serverSqliteColumnsCache = new Map<string, Set<string>>();
export const SYNC_V2_TABLES = [
  "kategori_barang",
  "subkategori_barang",
  "satuan_barang",
  "spesifikasi_cepat_barang",
  "barang",
  "barang_roll_variants",
  "harga_barang_satuan",
  "inventory_movements",
  "production_material_consumptions",
  "opsi_finishing",
  "pelanggan",
  "vendor",
  "profil",
  "kredensial",
  // actor_roles harus sebelum business_actors (FK role_code).
  "actor_roles",
  "business_actors",
  "penjualan",
  "item_penjualan",
  "penawaran",
  "item_penawaran",
  "pembelian",
  "item_pembelian",
  "purchase_orders",
  "purchase_order_items",
  "retur_penjualan",
  "item_retur_penjualan",
  "retur_pembelian",
  "item_retur_pembelian",
  "stock_opnames",
  "stock_opname_items",
  "piutang_penjualan",
  "pelunasan_piutang",
  "hutang_pembelian",
  "pelunasan_hutang",
  "order_produksi",
  "item_produksi",
  "item_finishing",
  "keuangan",
  "finance_category_definitions",
  "finance_participants",
  "finance_metric_mappings",
  "pengaturan_toko",
  "nsfp_pool",
  "lokasi",
  "accounting_periods",
  // surat_jalan harus sebelum item_surat_jalan (FK surat_jalan_id).
  "surat_jalan",
  "item_surat_jalan",
  // Modul Penggajian. proses_gaji sebelum slip/pinjaman (FK).
  "komponen_kompensasi",
  "proses_gaji",
  "slip_gaji",
  "pinjaman_karyawan",
];

export async function getServerSQLite(): Promise<any> {
  if (!isServerSide()) return null;
  // Skip SQLite entirely on web servers (Vercel / next dev / plain Node)
  // unless explicitly opted-in. Web users rely on Supabase as source of
  // truth — there is no useful purpose for a local file mirror, and on
  // Vercel the filesystem is read-only anyway.
  if (skipServerSqliteMirror()) return null;

  if (!serverSqliteDb) {
    try {
      const Database = (await import("better-sqlite3")).default;
      const path = await import("path");
      const dbPath = path.join(process.cwd(), "database", "gemiprint.db");
      serverSqliteDb = new Database(dbPath);
      serverSqliteDb.pragma("journal_mode = WAL");
      serverSqliteDb.pragma("foreign_keys = ON");
      ensureServerSQLiteSyncV2Schema(serverSqliteDb);
      console.info("✅ Server-side SQLite connected:", dbPath);
    } catch (error) {
      console.error("❌ Failed to initialize server SQLite:", error);
      return null;
    }
  }

  return serverSqliteDb;
}

/**
 * SQLite cannot ALTER a CHECK constraint. Older installs created actor_roles
 * with role_group IN ('profit_share','cash_advance','bonus','other').
 * Recreate the table without that constraint and map legacy values to the
 * new display categories (owner / management / sales / staff / other).
 */

// ── Schema helpers (extracted) ──────────────────────────────────────────────
import {
  migrateActorRolesLegacyCheckConstraint,
  migrateInventoryMovementsCheckConstraint,
  ensureCommercialWorkflowTables,
} from "./db-sqlite-schema";

export {
  migrateActorRolesLegacyCheckConstraint,
  migrateInventoryMovementsCheckConstraint,
  ensureCommercialWorkflowTables,
} from "./db-sqlite-schema";

// ── Migration helpers (extracted) ────────────────────────────────────────────
import {
  migrateCashbookFormulaDbColumnNullable,
  ensureServerSQLiteSyncV2Schema,
} from "./db-sqlite-migrations";

export {
  migrateCashbookFormulaDbColumnNullable,
  ensureServerSQLiteSyncV2Schema,
} from "./db-sqlite-migrations";
