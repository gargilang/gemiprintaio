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

## ✅ Yang Sudah Dikerjakan (50% Complete)

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

### Phase 2: Migration ✅ 50%

**Services Created** (8 services):

1. ✅ `materials-service.ts` - Materials CRUD
2. ✅ `customers-service.ts` - Customers CRUD
3. ✅ `vendors-service.ts` - Vendors CRUD
4. ✅ `master-service.ts` - Master data (categories, units, etc)
5. ✅ `purchases-service.ts` - Purchases + items + stock update
6. ✅ `finance-service.ts` - Cash book + running totals
7. ✅ `users-service.ts` - Users + password management
8. ✅ `auth-service.ts` - Login + session verification

**Pages Migrated** (4 pages):

1. ✅ `purchases/page.tsx` - 7 API calls → services
2. ✅ `finance/page.tsx` - 1 API call → service
3. ✅ `users/page.tsx` - 1 API call → service
4. ✅ `auth/login/page.tsx` - 2 API calls → services

**API Routes Eliminated**: 11 routes ✅

**Tests**: 19/19 unit tests passing ✅

**Build Status**: ✅ Type check passed, Build successful

---

## ⏳ Yang Harus Dikerjakan Selanjutnya

### Priority 1: Migrate Remaining Routes (~40 routes)

#### Production Routes (5 routes)

```
/api/production → production-service.ts
/api/production/[id]
/api/production/items/[itemId]
```

**Functions needed**:

- `getProductions()`
- `getProduction(id)`
- `createProduction(data)`
- `updateProduction(id, data)`
- `deleteProduction(id)`

---

#### POS/Sales Routes (7 routes)

```
/api/pos/init-data → pos-service.ts
/api/pos/sales
/api/pos/sales/[id]
/api/pos/receivables
/api/pos/pay-receivable
/api/pos/sales/revert-payment
```

**Functions needed**:

- `getInitData()`
- `getSales()`
- `createSale(data)`
- `getReceivables()`
- `payReceivable(id, amount)`

---

#### Reports Routes (2 routes)

```
/api/reports/financial → reports-service.ts
/api/cashbook/archive
```

**Functions needed**:

- `getFinancialReport(startDate, endDate)`
- `getArchivedCashbook()`

---

#### Master Data Operations (12 routes)

```
/api/master/categories/reorder
/api/master/subcategories/reorder
/api/master/units/reorder
/api/master/quick-specs/reorder
/api/finishing-options/manage
... dll
```

**Strategy**: Tambahkan ke `master-service.ts`:

- `reorderCategories(items)`
- `reorderSubcategories(items)`
- `reorderUnits(items)`
- `manageFinishingOptions(data)`

---

#### Backup/Sync Routes (4 routes)

```
/api/sync/manual → db.syncToCloud()
/api/sync/auto → db.syncToCloud()
/api/backup/create → Tauri command
/api/backup/status → Tauri command
```

**Strategy**:

- Sync: Gunakan `db.syncToCloud()` langsung
- Backup: Buat Tauri commands baru

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

## 🚨 Aturan Penting

### DO ✅

- Gunakan `db-unified.ts` untuk semua operasi database
- Gunakan `normalizeRecord()` untuk konversi data
- Gunakan `getCurrentTimestamp()` untuk timestamps
- Gunakan `generateId()` untuk IDs
- Gunakan `db.transaction()` untuk operasi multi-table
- Test di Tauri dan Web mode

### DON'T ❌

- Jangan gunakan `db-adapter.ts`, `db.ts`, `sqlite-db.ts`
- Jangan gunakan `fetch("/api/...")` di code baru
- Jangan gunakan `dibuat_pada`, `diperbarui_pada` (gunakan `created_at`, `updated_at`)
- Jangan mix boolean (gunakan normalization)
- Jangan buat API route baru

---

## 📊 Current Status

**Progress**: 50% Complete

**Completed**:

- ✅ Infrastructure (100%)
- ✅ Core services (100%)
- ✅ Core pages (100%)
- ✅ Unit tests (19 passing)
- ✅ Transaction support
- ✅ Build verification

**Remaining**:

- ⏳ Production routes
- ⏳ POS/Sales routes
- ⏳ Reports routes
- ⏳ Master operations
- ⏳ Backup/Sync routes
- ⏳ Integration tests
- ⏳ API routes removal

**Estimated Time to Complete**: 2-3 weeks

---

## 🎯 Next Immediate Actions

1. **Migrate Production Routes** (5 routes, ~3 hours)
2. **Migrate POS/Sales Routes** (7 routes, ~4 hours)
3. **Migrate Reports Routes** (2 routes, ~2 hours)
4. **Add Master Operations** (12 routes, ~6 hours)
5. **Remove API Routes** (after verification, ~2 hours)
6. **Integration Tests** (~8 hours)
7. **Production Deployment** (~1 week)

**Total Remaining**: ~2-3 weeks

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
**Status**: Phase 2 Core Complete (50%)  
**Next**: Migrate remaining routes
