# Database Layer - Quick Reference

## 🎯 TL;DR

**Gunakan `db-unified.ts` untuk semua operasi database.**

```typescript
import { db } from "@/lib/db-unified";

// Query
const result = await db.query("barang", {
  where: { kategori_id: "cat-123" },
  orderBy: { column: "nama", ascending: true },
});

// Insert
await db.insert("barang", {
  nama: "Kertas A4",
  satuan_dasar: "rim",
});

// Update
await db.update("barang", "mat-123", {
  nama: "Kertas A4 Premium",
});

// Delete
await db.delete("barang", "mat-123");
```

---

## 📚 Documentation

| File | Purpose |
|------|---------|
| **IMPLEMENTATION-SUMMARY.md** | Executive summary - what was done |
| **MIGRATION-PROGRESS.md** | Detailed progress tracking |
| **MIGRATION-GUIDE.md** | Step-by-step migration guide |
| **DATABASE-ARCHITECTURE.md** | Technical architecture & diagrams |
| **TODO-NEXT-STEPS.md** | Action items & checklist |
| **README-DATABASE.md** | This file - quick reference |

---

## 🚀 Quick Start

### For New Features

```typescript
// 1. Import the unified database
import { db } from "@/lib/db-unified";

// 2. Use it directly (auto-detects Tauri/Web)
const materials = await db.query("barang");

// 3. Handle errors
const result = await db.insert("barang", data);
if (result.error) {
  console.error(result.error);
  return;
}
```

### For Existing Code

```typescript
// ❌ OLD - Don't use
const res = await fetch("/api/materials");
const data = await res.json();

// ✅ NEW - Use this
import { getMaterials } from "@/lib/services/materials-service";
const materials = await getMaterials();
```

---

## 🔧 Common Operations

### Create Material with Unit Prices

```typescript
import { createMaterialWithUnitPrices } from "@/lib/db-unified";

await createMaterialWithUnitPrices({
  nama: "Kertas A4",
  satuan_dasar: "rim",
  unit_prices: [
    { nama_satuan: "rim", faktor_konversi: 1, harga_jual: 50000 },
    { nama_satuan: "pack", faktor_konversi: 0.1, harga_jual: 5000 },
  ],
});
```

### Get Material with Prices

```typescript
import { getMaterialWithUnitPrices } from "@/lib/db-unified";

const material = await getMaterialWithUnitPrices("mat-123");
console.log(material.data.unit_prices);
```

### Normalize Data

```typescript
import { normalizeRecord } from "@/lib/db-unified";

// SQLite → Supabase
const supabaseData = normalizeRecord(sqliteData, "toSupabase");

// Supabase → SQLite
const sqliteData = normalizeRecord(supabaseData, "toSQLite");
```

### Check Sync Status

```typescript
import { db } from "@/lib/db-unified";

// Get pending count
const count = await db.getPendingSyncCount();

// Manual sync (Tauri only)
const result = await db.syncToCloud();
console.log(`Synced: ${result.synced}, Failed: ${result.failed}`);
```

---

## 🏗️ Architecture

```
Component
    ↓
Service (materials-service.ts)
    ↓
db-unified.ts
    ↓
┌─────────────┬─────────────┐
│   Tauri     │     Web     │
│   SQLite    │  Supabase   │
│     +       │      +      │
│ sync_queue  │ localStorage│
└─────────────┴─────────────┘
```

---

## 📋 Checklist for Migration

- [ ] Replace `fetch("/api/...")` with service call
- [ ] Use `db.query/insert/update/delete` instead of raw SQL
- [ ] Use `normalizeRecord()` for data conversion
- [ ] Use `getCurrentTimestamp()` for timestamps
- [ ] Use `generateId()` for IDs
- [ ] Test in both Tauri and Web mode
- [ ] Test offline functionality

---

## ⚠️ Common Pitfalls

### 1. Don't use deprecated files
```typescript
// ❌ WRONG
import { DatabaseAdapter } from "@/lib/db-adapter";

// ✅ CORRECT
import { db } from "@/lib/db-unified";
```

### 2. Don't use old timestamp fields
```typescript
// ❌ WRONG
data.dibuat_pada = new Date().toISOString();

// ✅ CORRECT
import { getCurrentTimestamp } from "@/lib/db-unified";
data.created_at = getCurrentTimestamp();
```

### 3. Don't mix boolean formats
```typescript
// ❌ WRONG
data.aktif = true; // Will fail in SQLite

// ✅ CORRECT
import { normalizeRecord } from "@/lib/db-unified";
const normalized = normalizeRecord(data, "toSQLite");
```

### 4. Don't call API routes in new code
```typescript
// ❌ WRONG
const res = await fetch("/api/materials");

// ✅ CORRECT
import { getMaterials } from "@/lib/services/materials-service";
const materials = await getMaterials();
```

---

## 🧪 Testing

```bash
# Type check
npm run type-check

# Lint
npm run lint

# Build
npm run build

# Tauri build
npm run tauri build

# Run tests (when available)
npm test
```

---

## 🆘 Troubleshooting

### "Database not initialized"
- **Tauri**: Check if database file exists in app data directory
- **Web**: Check Supabase connection (env vars)

### "Sync failed"
- Check internet connection
- Verify Supabase credentials
- Check sync_queue table for errors

### "Type mismatch"
- Use `normalizeRecord()` to convert data
- Check field names (created_at vs dibuat_pada)

### "Operation queued but not synced"
- **Tauri**: Manually trigger `db.syncToCloud()`
- **Web**: Check if back online, trigger `db.processOfflineQueue()`

---

## 📞 Support

- **Documentation**: See files listed at top
- **Examples**: Check `src/lib/services/materials-service.ts`
- **Issues**: Create GitHub issue with details

---

## 🎓 Learning Path

1. Read **IMPLEMENTATION-SUMMARY.md** (5 min)
2. Read **MIGRATION-GUIDE.md** (15 min)
3. Study **DATABASE-ARCHITECTURE.md** (30 min)
4. Review example service: `materials-service.ts` (10 min)
5. Try migrating one API route (1 hour)

---

**Last Updated**: 2025-11-14  
**Version**: 1.0.0
