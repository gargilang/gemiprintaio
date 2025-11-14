# Migration Guide - API Routes to Unified Database Layer

## Overview

Aplikasi sedang dalam proses migrasi dari arsitektur API Routes (Next.js) ke Unified Database Layer yang mendukung:
- **Tauri Desktop**: SQLite lokal + background sync ke Supabase
- **Web App**: Supabase langsung + offline queue

## Current Architecture

### Before (Old)
```
Component → fetch("/api/...") → API Route → sqlite-db.ts → SQLite/Supabase
```

### After (New)
```
Component → Service → db-unified.ts → Tauri (SQLite) / Web (Supabase)
```

## Migration Steps for Each Feature

### 1. Identify API Route Usage

Search for fetch calls:
```bash
grep -r "fetch('/api/" src/app/
```

### 2. Check if Service Exists

Services already migrated:
- ✅ `materials-service.ts`
- ✅ `customers-service.ts`
- ✅ `vendors-service.ts`
- ✅ `master-service.ts`

### 3. Create Service if Needed

Example: `src/lib/services/purchases-service.ts`

```typescript
import { db } from "../db-unified";

export async function getPurchases() {
  const result = await db.query("pembelian", {
    orderBy: { column: "created_at", ascending: false },
  });
  
  if (result.error) throw result.error;
  return result.data || [];
}

export async function createPurchase(data: any) {
  const result = await db.insert("pembelian", data);
  
  if (result.error) throw result.error;
  return result.data;
}
```

### 4. Update Component

**Before:**
```typescript
const loadData = async () => {
  const res = await fetch("/api/materials");
  const data = await res.json();
  setMaterials(data.barang || []);
};
```

**After:**
```typescript
const loadData = async () => {
  const { getMaterials } = await import("@/lib/services/materials-service");
  const materials = await getMaterials();
  setMaterials(materials || []);
};
```

### 5. Test Both Modes

- Test in Web mode (browser)
- Test in Tauri mode (desktop app)
- Test offline functionality

### 6. Mark API Route as Deprecated

Add to top of API route file:
```typescript
/**
 * ⚠️ DEPRECATED - DO NOT USE IN NEW CODE ⚠️
 * 
 * This API route will be removed after migration.
 * Use src/lib/services/xxx-service.ts instead.
 * 
 * @deprecated Use xxx-service.ts
 */
```

### 7. Remove API Route (After All Usages Migrated)

Only delete after:
- All components updated
- All tests passing
- Both Tauri and Web modes verified

## Composite Operations

For complex operations involving multiple tables, create composite functions in `db-unified.ts`:

```typescript
export async function createMaterialWithUnitPrices(data: MaterialInput) {
  // 1. Validate
  // 2. Insert material
  // 3. Insert unit prices
  // 4. Handle errors
  // 5. Return result
}
```

## Handling Transactions

For operations that need atomicity:

```typescript
// Tauri: Use SQLite transactions via raw SQL
if (isTauriApp()) {
  await db.executeRaw("BEGIN TRANSACTION");
  try {
    // ... operations
    await db.executeRaw("COMMIT");
  } catch (error) {
    await db.executeRaw("ROLLBACK");
    throw error;
  }
}

// Web: Supabase doesn't support client-side transactions
// Use RPC functions or Edge Functions for complex operations
```

## Data Normalization

Always use `normalizeRecord()` when moving data between SQLite and Supabase:

```typescript
import { normalizeRecord } from "@/lib/db-unified";

// Before sending to Supabase
const normalized = normalizeRecord(sqliteData, "toSupabase");

// After receiving from Supabase
const normalized = normalizeRecord(supabaseData, "fromSupabase");
```

## Offline Queue

Web app automatically queues operations when offline:

```typescript
// This will auto-queue if offline
await db.insert("barang", materialData);

// Queue is auto-processed when back online
// Or manually trigger:
await db.processOfflineQueue();
```

Tauri app queues to `sync_queue` table:

```typescript
// This will auto-queue to sync_queue
await db.insert("barang", materialData);

// Manually trigger sync:
await db.syncToCloud();
```

## Testing Checklist

For each migrated feature:

- [ ] Web mode - online
- [ ] Web mode - offline → online (queue processing)
- [ ] Tauri mode - create/update/delete
- [ ] Tauri mode - sync to cloud
- [ ] Error handling
- [ ] Loading states
- [ ] Data consistency

## Common Pitfalls

### 1. Timestamp Fields

❌ **Wrong:**
```typescript
data.dibuat_pada = new Date().toISOString();
```

✅ **Correct:**
```typescript
import { getCurrentTimestamp } from "@/lib/db-unified";
data.created_at = getCurrentTimestamp();
```

### 2. Boolean Values

❌ **Wrong:**
```typescript
// Mixing boolean and 0/1
data.aktif = true; // Will fail in SQLite
```

✅ **Correct:**
```typescript
import { normalizeRecord } from "@/lib/db-unified";
const normalized = normalizeRecord(data, "toSQLite");
// normalized.aktif will be 0 or 1
```

### 3. ID Generation

❌ **Wrong:**
```typescript
data.id = `mat-${Date.now()}`;
```

✅ **Correct:**
```typescript
import { generateId } from "@/lib/db-unified";
data.id = generateId();
```

### 4. Direct API Calls in New Code

❌ **Wrong:**
```typescript
// In new component
const res = await fetch("/api/materials");
```

✅ **Correct:**
```typescript
import { getMaterials } from "@/lib/services/materials-service";
const materials = await getMaterials();
```

## Migration Priority

### High Priority (Core Features)
1. ✅ Materials (DONE)
2. ⏳ Purchases
3. ⏳ Customers
4. ⏳ Vendors
5. ⏳ Production

### Medium Priority
6. ⏳ Finance/Cash Book
7. ⏳ Reports
8. ⏳ Users

### Low Priority (Admin Features)
9. ⏳ Settings
10. ⏳ Backup/Sync
11. ⏳ Master Data

## API Routes to Migrate

### Purchases
- `/api/purchases` → `purchases-service.ts`
- `/api/purchases/init-data` → `purchases-service.ts`
- `/api/purchases/debts` → `purchases-service.ts`
- `/api/purchases/pay-debt` → `purchases-service.ts`
- `/api/purchases/revert-payment` → `purchases-service.ts`

### Finance
- `/api/finance/cash-book` → `finance-service.ts`
- `/api/finance/cash-book/[id]` → `finance-service.ts`

### Users
- `/api/users` → `users-service.ts`
- `/api/users/[id]` → `users-service.ts`
- `/api/passwords` → `users-service.ts`
- `/api/passwords/[id]` → `users-service.ts`

### Auth
- `/api/auth/login` → `auth-service.ts`

### Sync
- `/api/sync/manual` → Use `db.syncToCloud()` directly
- `/api/sync/auto` → Use `db.syncToCloud()` directly

### Backup
- `/api/backup/create` → Tauri command
- `/api/backup/status` → Tauri command
- `/api/backup/settings` → Tauri command

## Questions?

Refer to:
- `MIGRATION-PROGRESS.md` - Current status
- `src/lib/db-unified.ts` - Core implementation
- `src/lib/services/materials-service.ts` - Example service

---

**Last Updated**: 2025-11-14
