# AI Agent Context - GemiPrint Database Migration

## 🎯 Tujuan Utama

Migrasi aplikasi GemiPrint dari arsitektur **Next.js API Routes** ke **Unified Database Layer** yang mendukung:

1. **Tauri Desktop App**: SQLite lokal + background sync ke Supabase
2. **Web App**: Supabase langsung + offline queue fallback
3. **Offline-First**: Aplikasi tetap berfungsi tanpa internet
4. **Data Consistency**: Sinkronisasi dua arah yang stabil

**Target Akhir**: Aplikasi bisa di-build sebagai:

- Static web app (hosting di Vercel/Netlify)
- Desktop app (Tauri) tanpa dependency ke Next.js API routes

---

## 🚨 Aturan Penting (BACA DULU!)

### DO ✅

- **Gunakan `db-unified.ts`** untuk semua operasi database
- **Gunakan `normalizeRecord()`** untuk konversi data dari DB
- **Gunakan `getCurrentTimestamp()`** untuk timestamps (ISO 8601)
- **Gunakan `generateId()`** untuk IDs baru
- **Gunakan `db.transaction()`** untuk operasi multi-table (Tauri only)
- **GUNAKAN `dibuat_pada`, `diperbarui_pada`** (SQLite & Supabase konsisten pakai bahasa Indonesia)
- ❌ Jangan mix boolean (0/1 vs true/false) - gunakan normalization
- **Test di Tauri dan Web mode** - pastikan kedua environment kerja
- **Gunakan `db.queryRaw()`** untuk query kompleks dengan JOIN
- **Always throw errors** dari service layer, jangan return error objects

### DON'T ❌

- ❌ Jangan gunakan `db-adapter.ts`, `db.ts`, `sqlite-db.ts` (DEPRECATED)
- ❌ Jangan gunakan `fetch("/api/...")` di code baru
- ❌ Jangan buat API route baru
- ❌ Jangan langsung delete DEPRECATED routes sebelum verifikasi 100%

### Pattern Migrasi

```typescript
// 1. Baca API route untuk pahami logic
// 2. Buat/update service dengan function baru
// 3. Import service di component
// 4. Replace fetch() dengan service call
// 5. Mark API route sebagai DEPRECATED dengan comment
// 6. Type-check: npm run type-check
// 7. Update dokumentasi progress
```

---

## ✅ Yang Sudah Dikerjakan (~85% Complete)

### Phase 1: Infrastructure ✅ 100%

**Core Database Layer** (`src/lib/db-unified.ts`):

- ✅ Auto-detect environment (Tauri vs Web)
- ✅ Unified offline queue (`offline_queue` key)
- ✅ Data normalization (timestamps, booleans, IDs)
- ✅ Transaction support (BEGIN/COMMIT/ROLLBACK)
- ✅ Composite operations (materials + unit_prices)
- ✅ Raw SQL support untuk operasi kompleks

**Rust Backend** (`src-tauri/src/`):

- ✅ `count_pending_sync` command
- ✅ `sync_to_cloud` command dengan Supabase REST API
- ✅ `sync.rs` module untuk HTTP sync
- ✅ Dependencies: reqwest, tokio

**Deprecated Files** (marked, not deleted):

- ⚠️ `db-adapter.ts` - DEPRECATED
- ⚠️ `db.ts` - DEPRECATED
- ⚠️ `sqlite-db.ts` - DEPRECATED (masih dipakai API routes)

---

### Phase 2: Migration ✅ 75%

**Services Created** (12 services):

1. ✅ `materials-service.ts` - Materials CRUD
2. ✅ `customers-service.ts` - Customers CRUD
3. ✅ `vendors-service.ts` - Vendors CRUD
4. ✅ `master-service.ts` - Master data (categories, units, etc) + **reorder functions**
5. ✅ `purchases-service.ts` - Purchases + items + stock + **getDebts()**
6. ✅ `finance-service.ts` - Cash book + running totals + **deleteAllCashbook()**
7. ✅ `users-service.ts` - Users + password management
8. ✅ `auth-service.ts` - Login + session verification
9. ✅ `production-service.ts` - Production orders + items + finishing
10. ✅ `pos-service.ts` - POS/Sales + receivables + stock management
11. ✅ `reports-service.ts` - Financial reports + archive management
12. ✅ `finishing-options-service.ts` - Finishing options CRUD + reorder

**Pages Migrated** (8 pages):

1. ✅ `purchases/page.tsx` - 7 API calls → services
2. ✅ `finance/page.tsx` - 5 API calls → services (FULLY MIGRATED)
3. ✅ `users/page.tsx` - 1 API call → service
4. ✅ `auth/login/page.tsx` - 2 API calls → services
5. ✅ `production/page.tsx` - 3 API calls → services
6. ✅ `pos/page.tsx` - 6 API calls → services
7. ✅ `reports/page.tsx` - 1 API call → service
8. ✅ `settings/page.tsx` - 7 API calls → services (master reorder + finishing options)
   - ⚠️ **Tersisa 7 calls**: backup/sync operations (perlu handling khusus)

**API Routes Marked DEPRECATED**: 31 routes ✅
**⚠️ Belum bisa dihapus**: Masih ada 20 fetch('/api/...') tersisa:

- settings/page.tsx: 7 calls (backup/sync operations)
- Components: 13 calls di 8 components (detail di bawah)

**Tests**: 19/19 unit tests passing ✅

**Build Status**: ✅ Type check passed, Build successful

---

## ⏳ Yang Harus Dikerjakan Selanjutnya

### Priority 1: Migrate Remaining Routes (~18 routes)

⚠️ **PENTING**: Masih ada **20 fetch('/api/...')** calls tersisa:

**Settings Page (7 calls)**:

- `/api/backup/status` (GET)
- `/api/backup/create` (POST)
- `/api/backup/settings` (PUT)
- `/api/sync/manual` (GET, POST) - 2 calls
- `/api/sync/auto` (GET, PUT) - 2 calls

**Components (13 calls)**:

- `PurchaseForm.tsx`: `/api/purchases` (POST)
- `AddFinishingModal.tsx`: `/api/finishing-options` (GET)
- `SelectMonthModal.tsx`: `/api/cashbook/archive` (GET)
- `PayReceivableModal.tsx`: `/api/pos/receivables`, `/api/pos/pay-receivable`
- `PayDebtModal.tsx`: `/api/purchases/debts`, `/api/purchases/pay-debt`
- `CloseBooksModal.tsx`: `/api/cashbook/archive` (POST)
- `ImportCsvModal.tsx`: `/api/cashbook/import` (POST)
- `MainShell.tsx`: `/api/sync/auto`, `/api/sync/manual` (4 calls)

**Tidak bisa delete DEPRECATED routes sampai semua fetch() dimigrate!**

#### ~~Production Routes~~ ✅ SELESAI (3 routes)

```
✅ /api/production → production-service.ts
✅ /api/production/[id]
✅ /api/production/items/[itemId]
```

**Functions implemented**:

- ✅ `getProductionOrders()`
- ✅ `getProductionOrderById(id)`
- ✅ `createProductionOrder(data)`
- ✅ `updateProductionOrderStatus(id, status)`
- ✅ `updateProductionItemStatus(itemId, data)`
- ✅ `deleteProductionOrder(id)`

---

#### ~~POS/Sales Routes~~ ✅ SELESAI (6 routes)

```
✅ /api/pos/init-data → pos-service.ts
✅ /api/pos/sales
✅ /api/pos/sales/[id]
✅ /api/pos/receivables
✅ /api/pos/pay-receivable
✅ /api/pos/sales/revert-payment
```

**Functions implemented**:

- ✅ `getPOSInitData()`
- ✅ `getSales(limit)`
- ✅ `createSale(data)`
- ✅ `deleteSale(id)`
- ✅ `getReceivables()`
- ✅ `payReceivable(data)`
- ✅ `revertSalePayment(data)`

---

#### ~~Reports Routes~~ ✅ SELESAI (2 routes)

```
✅ /api/reports/financial → reports-service.ts
✅ /api/cashbook/archive
```

**Functions implemented**:

- ✅ `getFinancialReport(label, archivedAt)` - Generate report from archived data
- ✅ `getArchivedPeriods()` - List all archived periods
- ✅ `archiveCashbook(startDate, endDate, label)` - Archive transactions
- ✅ `restoreArchivedTransactions(label, archivedAt)` - Unarchive

**Page migrated**: ✅ reports/page.tsx (1 API call → service)

---

#### ~~Master Data Operations~~ ✅ SELESAI (7 routes)

```
✅ /api/master/categories/reorder → master-service.ts
✅ /api/master/subcategories/reorder → master-service.ts
✅ /api/master/units/reorder → master-service.ts
✅ /api/master/quick-specs/reorder → master-service.ts
✅ /api/finishing-options/manage (GET/POST/PUT/DELETE/PATCH) → finishing-options-service.ts
```

**Functions implemented**:

- ✅ `reorderCategories(items)` - Update category display order
- ✅ `reorderSubcategories(items)` - Update subcategory display order
- ✅ `reorderUnits(items)` - Update unit display order
- ✅ `reorderQuickSpecs(items)` - Update quick spec display order
- ✅ `getFinishingOptions()` - Get all finishing options
- ✅ `createFinishingOption(data)` - Add new finishing option
- ✅ `updateFinishingOption(id, data)` - Update finishing option name
- ✅ `deleteFinishingOption(id)` - Soft delete finishing option
- ✅ `reorderFinishingOptions(updates)` - Update finishing options order

**Page migrated**: ✅ settings/page.tsx (7 API calls → services)

---

#### Backup/Sync Routes (7 routes) ← NEXT PRIORITY

```
⏳ /api/backup/status (GET) - Check backup status
⏳ /api/backup/create (POST) - Create manual backup
⏳ /api/backup/settings (PUT) - Update backup settings
⏳ /api/sync/manual (GET) - Get sync status
⏳ /api/sync/manual (POST) - Trigger manual sync
⏳ /api/sync/auto (GET) - Get auto-sync settings
⏳ /api/sync/auto (PUT) - Update auto-sync settings
```

**Strategy**:

- **Sync operations**: Sudah ada `db.syncToCloud()` di db-unified.ts, tinggal expose
- **Backup operations**: Perlu Tauri commands baru atau file system operations
- **Used by**: settings/page.tsx (7 calls), MainShell.tsx (4 calls)
- **Priority**: Medium - Optional features, tidak critical untuk core functionality

---

### Priority 2: Hapus API Routes

**Setelah semua routes dimigrate**:

1. Tandai semua file di `src/app/api/**/*` sebagai DEPRECATED
2. Verifikasi tidak ada lagi `fetch("/api/...")` di codebase
3. Hapus folder `src/app/api` secara bertahap
4. Test build Tauri (harus sukses tanpa API routes)

---

### Priority 3: Testing & Quality

**Integration Tests**:

- [ ] Test offline → online flow
- [ ] Test sync functionality (Tauri)
- [ ] Test queue processing (Web)
- [ ] Test transaction rollback

**E2E Tests**:

- [ ] Test complete user flow (create → read → update → delete)
- [ ] Test multi-table operations (purchases + items + stock)
- [ ] Test conflict scenarios

---

### Priority 4: Production Readiness

**Checklist**:

- [ ] All API routes migrated
- [ ] All tests passing (unit + integration)
- [ ] Build Tauri successful
- [ ] Performance benchmarks met
- [ ] Security audit
- [ ] Staging deployment
- [ ] User acceptance testing

---

## 🔧 Cara Kerja Sistem Saat Ini

### Tauri Desktop App

```
Component → Service → db-unified.ts
                          ↓
                      SQLite (lokal)
                          ↓
                    sync_queue table
                          ↓
                  Background sync (Rust)
                          ↓
                      Supabase (cloud)
```

### Web App

```
Component → Service → db-unified.ts
                          ↓
                  Online? Yes → Supabase
                          No → localStorage queue
                                    ↓
                              Auto-flush saat online
```

---

## 📝 Template untuk Migrasi Route Baru

### 1. Buat Service

```typescript
// src/lib/services/xxx-service.ts
import { db } from "../db-unified";

export async function getXxx() {
  const result = await db.query("table_name", {
    orderBy: { column: "created_at", ascending: false },
  });

  if (result.error) throw result.error;
  return result.data || [];
}

export async function createXxx(data: any) {
  const result = await db.insert("table_name", data);
  if (result.error) throw result.error;
  return result.data;
}
```

### 2. Update Component

```typescript
// Before
const res = await fetch("/api/xxx");
const data = await res.json();
setData(data.xxx);

// After
const { getXxx } = await import("@/lib/services/xxx-service");
const data = await getXxx();
setData(data);
```

### 3. Test

```bash
npm run type-check  # Verify types
npm test            # Run unit tests
npm run build       # Verify build
```

---

## 📊 Current Status

**Progress**: 85% Complete

**Completed**:

- ✅ Infrastructure (100%)
- ✅ Core services (12 services created)
- ✅ Core pages (8 pages migrated)
- ✅ Production routes (3 routes, 100%)
- ✅ POS/Sales routes (6 routes, 100%)
- ✅ Reports routes (2 routes, 100%)
- ✅ Master operations (7 routes, 100%)
- ✅ Unit tests (19 passing)
- ✅ Transaction support
- ✅ Build verification
- ✅ Type checking (0 errors)

**Remaining**:

- ⏳ Backup/Sync operations (7 routes) - settings + MainShell
- ⏳ Component migrations (13 API calls in 8 components)
- ⏳ Integration tests
- ⏳ API routes removal (after 100% verification)

**Estimated Time to Complete**: 2-3 days

---

## 🎯 Next Immediate Actions

1. ~~**Migrate Production Routes**~~ ✅ SELESAI (3 routes)
2. ~~**Migrate POS/Sales Routes**~~ ✅ SELESAI (6 routes)
3. ~~**Migrate Reports Routes**~~ ✅ SELESAI (2 routes)
4. ~~**Migrate Master Operations**~~ ✅ SELESAI (7 routes)
5. **Migrate Components** (13 API calls) ← NEXT PRIORITY
   - PurchaseForm, PayDebtModal, PayReceivableModal
   - CloseBooksModal, ImportCsvModal, SelectMonthModal
   - AddFinishingModal, MainShell
6. **Handle Backup/Sync Operations** (7 calls) ← OPTIONAL
   - Bisa skip dulu karena tidak critical
   - Atau migrate ke Tauri commands/direct db calls
7. **Final Verification** (~1 hour)
   - Grep untuk pastikan 0 fetch('/api/')
   - Delete semua DEPRECATED API routes
8. **Integration Tests** (~4 hours)
9. **Production Deployment** (~2 days)

**Total Remaining**: 2-3 days

---

## 📖 Dokumentasi

**Lokasi**: `d:\gemi\repos\gemiprintaio\doc\`

**Files**:

- `MIGRATION-PROGRESS.md` - Progress tracking (update ini)
- `MIGRATION-GUIDE.md` - How-to guide
- `README-DATABASE.md` - Quick reference
- `TODO-NEXT-STEPS.md` - Action items
- `AI-AGENT-CONTEXT.md` - This file (untuk AI agent)

---

## 💡 Tips untuk AI Agent

### Saat Migrate Route Baru:

1. **Baca API route** untuk understand logic
2. **Buat service** dengan functions yang dibutuhkan
3. **Update component** untuk gunakan service
4. **Test** dengan type-check dan build
5. **Update dokumentasi** (MIGRATION-PROGRESS.md)

### Saat Ada Error:

1. **Type error**: Cek interface, tambahkan `| null | undefined` jika perlu
2. **Build error**: Cek import path, pastikan service exported
3. **Runtime error**: Cek normalization, pastikan field names match

### Saat Selesai:

1. **Run tests**: `npm test`
2. **Type check**: `npm run type-check`
3. **Build**: `npm run build`
4. **Update docs**: MIGRATION-PROGRESS.md

---

**Last Updated**: 2025-11-14  
**Status**: Phase 2 Master Operations Complete (85%)  
**Next**: Migrate Components (13 API calls) + Optional Backup/Sync (7 calls)
