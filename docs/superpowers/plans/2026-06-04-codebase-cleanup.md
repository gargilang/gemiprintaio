# Gemiprint Codebase Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membersihkan, menyederhanakan, dan meningkatkan kualitas seluruh codebase gemiprint agar mudah di-maintain, efisien, dan bebas dari dead code.

**Architecture:** Cleanup dilakukan dalam 6 fase berurutan: (1) hapus dead code, (2) fix N+1 query di materials-service, (3) bersihkan console.log di 10 file, (4) hapus API shims English setelah Flutter migrasi, (5) pecah db-unified.ts yang 4.834 baris, (6) pecah file-file besar lainnya.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase Postgres, SQLite (better-sqlite3), Tailwind CSS 4, SWR (useCachedData), Jest

---

## Fase 1: Hapus Dead Code

### Task 1: Hapus use-async-data.ts

**Files:**
- Delete: `src/hooks/use-async-data.ts`

- [ ] **Step 1: Verifikasi tidak ada yang mengimport**

```bash
grep -r "use-async-data" src/ --include="*.ts" --include="*.tsx"
```
Expected: tidak ada output (hanya definisi di file itu sendiri).

- [ ] **Step 2: Hapus file**

```bash
rm src/hooks/use-async-data.ts
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: hapus hook useAsyncData yang tidak terpakai"
```

---

### Task 2: Hapus BagiHasilManageModal.tsx

**Files:**
- Delete: `src/components/BagiHasilManageModal.tsx`

- [ ] **Step 1: Verifikasi tidak ada yang mengimport**

```bash
grep -r "BagiHasilManageModal" src/ --include="*.ts" --include="*.tsx"
```
Expected: tidak ada output.

- [ ] **Step 2: Hapus file**

```bash
rm src/components/BagiHasilManageModal.tsx
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: hapus komponen BagiHasilManageModal yang tidak terpakai"
```

---
## Fase 2: Fix N+1 Query

### Task 3: Batch-load unit prices di getMaterials()

**Files:**
- Modify: `src/lib/services/materials-service.ts` baris 88-124

Masalah saat ini: untuk setiap barang, ada 2 query terpisah (harga_barang_satuan + barang_roll_variants). Jika ada 100 barang, ini 201 query ke database. Solusi: fetch semua sekaligus, lalu group di memory.

- [ ] **Step 1: Tulis test untuk memverifikasi bahwa getMaterials hanya melakukan 3 query (bukan N+3)**

Buka `src/lib/__tests__/db-unified.test.ts`, tambahkan test baru di bagian bawah:

```typescript
import { getMaterials } from "../services/materials-service";
import { db } from "../db-unified";

describe("getMaterials - query efficiency", () => {
  it("hanya melakukan 5 query terlepas dari jumlah barang", async () => {
    const querySpy = jest.spyOn(db, "query");
    await getMaterials();
    // 1x barang, 1x kategori_barang, 1x subkategori_barang,
    // 1x harga_barang_satuan (semua), 1x barang_roll_variants (semua)
    expect(querySpy).toHaveBeenCalledTimes(5);
    querySpy.mockRestore();
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL dulu**

```bash
npx jest src/lib/__tests__/db-unified.test.ts --testNamePattern="hanya melakukan 5 query" -t "hanya melakukan 5 query"
```
Expected: FAIL (karena saat ini query count > 5).

- [ ] **Step 3: Refactor getMaterials() di materials-service.ts**

Ganti blok `Promise.all(materials.map(async (material) => { ... }))` (baris 88-124) dengan:

```typescript
// Fetch semua unit prices dan roll variants sekaligus (batch load)
const allUnitPricesResult = await db.query<UnitPrice>("harga_barang_satuan", {
  orderBy: { column: "urutan_tampilan", ascending: true },
});
const allRollVariantsResult = await db.query<any>("barang_roll_variants", {
  orderBy: { column: "lebar_m", ascending: true },
});

const allUnitPrices = allUnitPricesResult.data || [];
const allRollVariants = allRollVariantsResult.data || [];

// Group di memory berdasarkan barang_id
const unitPricesByBarangId = new Map<string, UnitPrice[]>();
for (const up of allUnitPrices) {
  const list = unitPricesByBarangId.get(up.barang_id) || [];
  list.push(up);
  unitPricesByBarangId.set(up.barang_id, list);
}

const rollVariantsByBarangId = new Map<string, any[]>();
for (const rv of allRollVariants) {
  if (Number(rv.aktif_status) === 0) continue;
  const list = rollVariantsByBarangId.get(rv.barang_id) || [];
  list.push(rv);
  rollVariantsByBarangId.set(rv.barang_id, list);
}

const materialsWithUnits = materials.map((material: Material) => {
  const category = categories.find((c: any) => c.id === material.kategori_id);
  const subcategory = subcategories.find((sc: any) => sc.id === material.subkategori_id);
  return {
    ...material,
    category_name: category?.nama || undefined,
    subcategory_name: subcategory?.nama || undefined,
    unit_prices: unitPricesByBarangId.get(material.id) || [],
    roll_variants: rollVariantsByBarangId.get(material.id) || [],
  };
});
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

```bash
npx jest src/lib/__tests__/db-unified.test.ts -t "hanya melakukan 5 query"
```
Expected: PASS.

- [ ] **Step 5: Jalankan full test suite**

```bash
npm run type-check && npx jest
```
Expected: 0 TypeScript errors, semua test pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/materials-service.ts src/lib/__tests__/db-unified.test.ts
git commit -m "perf: batch-load harga dan roll variants di getMaterials, hilangkan N+1 query"
```

---
## Fase 3: Bersihkan console.log

### Task 4: Hapus / ganti console.log di production code

**Files:**
- Modify: `src/hooks/use-auto-sync.ts`
- Modify: `src/components/ModalEditManual.tsx`
- Modify: `src/components/MainShell.tsx`
- Modify: `src/lib/db-unified.ts`
- Modify: `src/app/api/sync/manual/route.ts`
- Modify: `src/components/StatusSinkronisasi.tsx`
- Modify: `src/lib/services/sync-operations-service.ts`
- Modify: `src/app/pengguna/page.tsx`

Aturan:
- console.log yang berisi info debug sementara (request/response body, userId debug) -> **hapus**
- console.log di sync engine yang berisi status operasi -> **ganti ke console.debug** (tidak muncul di production browser default)
- console.log di db-unified.ts yang berisi startup/migration info -> **ganti ke console.info** agar tetap terlihat saat troubleshoot

- [ ] **Step 1: Audit setiap file dan lakukan perubahan**

Di `src/app/pengguna/page.tsx`: cari dan hapus console.log yang berisi debug userId.

Di `src/components/ModalEditManual.tsx`: cari dan hapus console.log yang log request/response body.

Di `src/components/MainShell.tsx`: cari console.log yang diawali `[DEV]` atau sejenisnya, hapus.

Di `src/hooks/use-auto-sync.ts`: ganti semua `console.log(` menjadi `console.debug(`.

Di `src/lib/services/sync-operations-service.ts`: ganti semua `console.log(` menjadi `console.debug(`.

Di `src/app/api/sync/manual/route.ts`: ganti semua `console.log(` menjadi `console.debug(`.

Di `src/components/StatusSinkronisasi.tsx`: ganti semua `console.log(` menjadi `console.debug(`.

Di `src/lib/db-unified.ts`: ganti console.log startup/migration menjadi `console.info(`, hapus yang berisi debug data sementara.

- [ ] **Step 2: Verifikasi tidak ada console.log tersisa di file-file tersebut**

```bash
grep -n "console.log" src/hooks/use-auto-sync.ts src/components/ModalEditManual.tsx src/components/MainShell.tsx src/app/api/sync/manual/route.ts src/components/StatusSinkronisasi.tsx src/lib/services/sync-operations-service.ts src/app/pengguna/page.tsx
```
Expected: tidak ada output.

- [ ] **Step 3: Type-check dan build**

```bash
npm run type-check
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-auto-sync.ts src/components/ModalEditManual.tsx src/components/MainShell.tsx src/lib/db-unified.ts src/app/api/sync/manual/route.ts src/components/StatusSinkronisasi.tsx src/lib/services/sync-operations-service.ts src/app/pengguna/page.tsx
git commit -m "chore: hapus dan ganti console.log di production code"
```

---
## Fase 4: Migrasi Flutter & Hapus API Shims English

### Task 5: Migrasi Flutter dari endpoint English ke Indonesian

**Files:**
- Modify: semua file di `flutter/lib/services/` yang masih memanggil endpoint lama

Flutter masih aktif memanggil 6 endpoint lama:
- `/api/customers` -> ganti ke `/api/pelanggan`
- `/api/materials` -> ganti ke `/api/barang`
- `/api/purchases` -> ganti ke `/api/pembelian`
- `/api/production` -> ganti ke `/api/produksi`
- `/api/finance` -> ganti ke `/api/keuangan`
- `/api/users` -> ganti ke `/api/pengguna`

- [ ] **Step 1: Temukan semua file Flutter yang pakai endpoint lama**

```bash
grep -r "/api/customers|/api/materials|/api/purchases|/api/production|/api/finance|/api/users|/api/reports|/api/inventory" flutter/lib/ --include="*.dart" -l
```

- [ ] **Step 2: Ganti semua endpoint di setiap file yang ditemukan**

Untuk setiap file yang ditemukan di Step 1, lakukan penggantian berikut:

```bash
# Jalankan satu per satu di bash
sed -i "s|/api/customers|/api/pelanggan|g" flutter/lib/services/customer_service.dart
sed -i "s|/api/materials|/api/barang|g" flutter/lib/services/material_service.dart
sed -i "s|/api/purchases|/api/pembelian|g" flutter/lib/services/purchase_service.dart
sed -i "s|/api/production|/api/produksi|g" flutter/lib/services/production_service.dart
sed -i "s|/api/finance|/api/keuangan|g" flutter/lib/services/finance_service.dart
sed -i "s|/api/users|/api/pengguna|g" flutter/lib/services/user_service.dart
sed -i "s|/api/reports|/api/laporan|g" flutter/lib/services/report_service.dart
sed -i "s|/api/inventory|/api/inventori|g" flutter/lib/services/inventory_service.dart
```

Nama file Dart mungkin berbeda - sesuaikan dengan hasil Step 1.

- [ ] **Step 3: Verifikasi tidak ada endpoint lama tersisa**

```bash
grep -r "/api/customers|/api/materials|/api/purchases|/api/production|/api/finance|/api/users|/api/reports|/api/inventory" flutter/lib/ --include="*.dart"
```
Expected: tidak ada output.

- [ ] **Step 4: Build Flutter untuk verifikasi**

```bash
cd flutter && flutter build apk --debug --dart-define=API_BASE_URL=https://app.gemiprint.com 2>&1 | tail -20
```
Expected: build sukses tanpa error.

- [ ] **Step 5: Commit perubahan Flutter**

```bash
git add flutter/
git commit -m "feat(flutter): migrasi semua endpoint API ke route bahasa Indonesia"
```

---

### Task 6: Hapus semua folder API shim English di Next.js

**Files:**
- Delete: `src/app/api/customers/`
- Delete: `src/app/api/materials/`
- Delete: `src/app/api/purchases/`
- Delete: `src/app/api/production/`
- Delete: `src/app/api/finance/`
- Delete: `src/app/api/users/`
- Delete: `src/app/api/reports/`
- Delete: `src/app/api/inventory/`

PENTING: Hanya lakukan Task ini SETELAH Task 5 selesai dan Flutter sudah di-deploy / diuji.

- [ ] **Step 1: Hapus semua folder shim**

```bash
rm -rf src/app/api/customers
rm -rf src/app/api/materials
rm -rf src/app/api/purchases
rm -rf src/app/api/production
rm -rf src/app/api/finance
rm -rf src/app/api/users
rm -rf src/app/api/reports
rm -rf src/app/api/inventory
```

- [ ] **Step 2: Type-check dan build**

```bash
npm run type-check && npm run build
```
Expected: 0 errors, build sukses.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: hapus 8 folder API shim English yang sudah tidak dipakai"
```

---
## Fase 5: Pecah File Raksasa

### Task 7: Pecah db-unified.ts menjadi 3 file

**Files:**
- Create: `src/lib/db-supabase.ts` — Supabase client, koneksi, dan helper Supabase-specific
- Create: `src/lib/db-sqlite.ts` — SQLite client, lazy-init, runtime migrations, dan helper SQLite-specific
- Modify: `src/lib/db-unified.ts` — dipangkas menjadi router tipis yang re-export dari kedua file di atas, plus class UnifiedDatabase

Struktur target:

```
src/lib/
  db-supabase.ts     # ~200 baris: createClient, getServerSupabaseClient, Supabase query helpers
  db-sqlite.ts       # ~800 baris: getServerSQLite, ensureSchema, semua ALTER TABLE migrations
  db-unified.ts      # ~1500 baris: UnifiedDatabase class, query/insert/update/delete/transaction router
```

- [ ] **Step 1: Buat db-supabase.ts**

Pindahkan dari db-unified.ts ke file baru `src/lib/db-supabase.ts`:
- Import `createClient` dari `@supabase/supabase-js`
- Fungsi `getServerSupabaseClient()`
- Semua helper yang khusus Supabase (RPC calls, realtime, dsb)
- Export semua fungsi tersebut

```typescript
// src/lib/db-supabase.ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

export function getServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
// ... sisa helper Supabase
```

- [ ] **Step 2: Buat db-sqlite.ts**

Pindahkan dari db-unified.ts ke file baru `src/lib/db-sqlite.ts`:
- Import `better-sqlite3`
- Variabel `serverSqliteDb` dan `getServerSQLite()`
- Semua fungsi `ensureXxxSchema()` dan `ensureXxxTables()`
- Semua blok `ALTER TABLE ADD COLUMN IF NOT EXISTS` (runtime migrations)

```typescript
// src/lib/db-sqlite.ts
import "server-only";

let serverSqliteDb: any = null;

export function getServerSQLite() {
  if (serverSqliteDb) return serverSqliteDb;
  // ... lazy init better-sqlite3
}

export function ensureAllSchemas(db: any) {
  ensureBaseSchema(db);
  ensureCommercialWorkflowTables(db);
  ensureSyncV2Schema(db);
  // ...
}
// ... semua fungsi migrasi
```

- [ ] **Step 3: Update db-unified.ts**

Di `src/lib/db-unified.ts`, hapus semua kode yang sudah dipindah, ganti dengan import:

```typescript
import "server-only";
export { getServerSupabaseClient } from "./db-supabase";
export { getServerSQLite } from "./db-sqlite";
// ... sisa: UnifiedDatabase class dan export db
```

- [ ] **Step 4: Pastikan semua import di codebase tetap valid**

Semua file yang mengimport dari `@/lib/db-unified` tidak perlu diubah karena db-unified.ts masih re-export semuanya. Verifikasi:

```bash
npm run type-check
```
Expected: 0 errors.

- [ ] **Step 5: Jalankan full test suite**

```bash
npx jest
```
Expected: semua test pass.

- [ ] **Step 6: Build**

```bash
npm run build
```
Expected: build sukses.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db-unified.ts src/lib/db-supabase.ts src/lib/db-sqlite.ts
git commit -m "refactor: pecah db-unified.ts menjadi db-supabase.ts, db-sqlite.ts, dan router tipis"
```

---

### Task 8: Pecah pengaturan/page.tsx menjadi komponen per tab

**Files:**
- Existing: `src/app/pengaturan/PpnTab.tsx` (sudah ada)
- Existing: `src/app/pengaturan/PeriodCloseTab.tsx` (sudah ada)
- Existing: `src/app/pengaturan/NomorUrutTab.tsx` (sudah ada)
- Create: `src/app/pengaturan/PengaturanTokoTab.tsx` — tab "company" (info toko, logo, bank, printer)
- Create: `src/app/pengaturan/PengaturanSetupTab.tsx` — tab "setup" (kategori, subkategori, satuan, quick specs, finishing options)
- Create: `src/app/pengaturan/PengaturanSistemTab.tsx` — tab "system" (sync, theme, printer preferences)
- Modify: `src/app/pengaturan/page.tsx` — dipangkas menjadi hanya tab router + state management

Target ukuran page.tsx setelah refactor: < 200 baris.

- [ ] **Step 1: Ekstrak tab "company" ke PengaturanTokoTab.tsx**

Buat `src/app/pengaturan/PengaturanTokoTab.tsx`:
- Pindahkan semua state, handlers, dan JSX yang terkait pengaturan toko (nama toko, alamat, telepon, logo, bank, printer)
- Props yang dibutuhkan dari parent: `onNotifikasi: (n: NotificationToastProps) => void`

- [ ] **Step 2: Ekstrak tab "setup" ke PengaturanSetupTab.tsx**

Buat `src/app/pengaturan/PengaturanSetupTab.tsx`:
- Pindahkan semua state, DnD handlers, dan JSX untuk kategori, subkategori, satuan, quick specs, finishing options
- Props: `onNotifikasi: (n: NotificationToastProps) => void`

- [ ] **Step 3: Ekstrak tab "system" ke PengaturanSistemTab.tsx**

Buat `src/app/pengaturan/PengaturanSistemTab.tsx`:
- Pindahkan state dan JSX untuk sync interval, theme selector, printer preferences
- Props: `onNotifikasi: (n: NotificationToastProps) => void`

- [ ] **Step 4: Slim down page.tsx**

page.tsx hanya berisi:
- State `activeTab` dan `notifikasi`
- Tab navigation bar
- Switch/conditional render ke masing-masing komponen tab
- Import semua tab components

- [ ] **Step 5: Type-check dan build**

```bash
npm run type-check && npm run build
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/pengaturan/
git commit -m "refactor: pecah pengaturan/page.tsx menjadi komponen per tab"
```

---
## Fase 6: Pecah Service Files Besar

### Task 9: Pecah pos-service.ts menjadi queries + mutations

**Files:**
- Create: `src/lib/services/pos-queries.ts` — semua fungsi GET/read
- Create: `src/lib/services/pos-mutations.ts` — semua fungsi create/void/revert/payment
- Modify: `src/lib/services/pos-service.ts` — dijadikan barrel re-export dari kedua file di atas

Pembagian tanggung jawab:

| File | Fungsi yang masuk |
|------|------------------|
| pos-queries.ts | getSales, getSaleById, getInitData, getReceivables, getSaleItems |
| pos-mutations.ts | createSale, voidSale, payReceivable, revertPayment, createMaklonPO |

- [ ] **Step 1: Buat pos-queries.ts**

```bash
touch src/lib/services/pos-queries.ts
```

Salin semua fungsi read-only dari pos-service.ts ke pos-queries.ts. Pertahankan semua import yang diperlukan di file baru.

- [ ] **Step 2: Buat pos-mutations.ts**

```bash
touch src/lib/services/pos-mutations.ts
```

Salin semua fungsi mutasi dari pos-service.ts ke pos-mutations.ts. Pertahankan semua import yang diperlukan.

- [ ] **Step 3: Ubah pos-service.ts menjadi barrel**

Ganti seluruh isi pos-service.ts dengan re-exports:

```typescript
// pos-service.ts — barrel export, pertahankan backward-compat untuk semua consumer
export * from "./pos-queries";
export * from "./pos-mutations";
```

Semua API routes dan komponen yang mengimport dari pos-service tidak perlu diubah.

- [ ] **Step 4: Type-check**

```bash
npm run type-check
```
Expected: 0 errors.

- [ ] **Step 5: Jalankan tests**

```bash
npx jest
```
Expected: semua pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/pos-service.ts src/lib/services/pos-queries.ts src/lib/services/pos-mutations.ts
git commit -m "refactor: pecah pos-service.ts menjadi pos-queries dan pos-mutations"
```

---

### Task 10: Pecah purchases-service.ts menjadi queries + mutations

**Files:**
- Create: `src/lib/services/purchases-queries.ts` — semua fungsi GET/read
- Create: `src/lib/services/purchases-mutations.ts` — semua fungsi create/update/void/payment
- Modify: `src/lib/services/purchases-service.ts` — dijadikan barrel re-export

Pembagian tanggung jawab:

| File | Fungsi yang masuk |
|------|------------------|
| purchases-queries.ts | getPurchases, getPurchaseById, getInitData, getDebts, enrichPurchaseRows |
| purchases-mutations.ts | createPurchase, updatePurchase, deletePurchase, payDebt, revertPayment, createReturn |

- [ ] **Step 1: Buat purchases-queries.ts**

```bash
touch src/lib/services/purchases-queries.ts
```

Salin semua fungsi read-only dari purchases-service.ts, termasuk helper `enrichPurchaseRows`.

- [ ] **Step 2: Buat purchases-mutations.ts**

```bash
touch src/lib/services/purchases-mutations.ts
```

Salin semua fungsi mutasi. Pastikan import `enrichPurchaseRows` dari purchases-queries jika dibutuhkan di mutations.

- [ ] **Step 3: Ubah purchases-service.ts menjadi barrel**

```typescript
// purchases-service.ts — barrel export
export * from "./purchases-queries";
export * from "./purchases-mutations";
```

- [ ] **Step 4: Type-check dan tests**

```bash
npm run type-check && npx jest
```
Expected: 0 errors, semua test pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/purchases-service.ts src/lib/services/purchases-queries.ts src/lib/services/purchases-mutations.ts
git commit -m "refactor: pecah purchases-service.ts menjadi purchases-queries dan purchases-mutations"
```

---
## Fase 7: Pecah Komponen UI Besar

### Task 11: Pecah FormulirPembelian.tsx (1.522 baris)

**Files:**
- Create: `src/components/FormulirPembelianHeader.tsx` — bagian header form (vendor picker, tanggal, nomor)
- Create: `src/components/FormulirPembelianItems.tsx` — tabel item pembelian + add/remove row
- Create: `src/components/FormulirPembelianFooter.tsx` — total, PPN, payment method, submit
- Modify: `src/components/FormulirPembelian.tsx` — orchestrator yang merakit ketiga sub-komponen

- [ ] **Step 1: Ekstrak FormulirPembelianHeader.tsx**

Pindahkan JSX dan state untuk vendor picker, tanggal, nomor faktur pembelian ke file baru.
Props minimal: `{ vendorId, onVendorChange, tanggal, onTanggalChange, nomor, onNomorChange, disabled }`

- [ ] **Step 2: Ekstrak FormulirPembelianItems.tsx**

Pindahkan tabel baris item (barang picker, qty, harga, diskon) ke file baru.
Props minimal: `{ items, onItemsChange, disabled }`

- [ ] **Step 3: Ekstrak FormulirPembelianFooter.tsx**

Pindahkan total kalkulasi, toggle PPN, metode pembayaran, dan tombol submit ke file baru.
Props minimal: `{ subtotal, ppn, total, metodePembayaran, onMetodeChange, onSubmit, loading }`

- [ ] **Step 4: Slim down FormulirPembelian.tsx**

FormulirPembelian.tsx hanya berisi state management utama dan merakit 3 komponen di atas.
Target: < 200 baris.

- [ ] **Step 5: Type-check dan build**

```bash
npm run type-check && npm run build
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/FormulirPembelian.tsx src/components/FormulirPembelianHeader.tsx src/components/FormulirPembelianItems.tsx src/components/FormulirPembelianFooter.tsx
git commit -m "refactor: pecah FormulirPembelian.tsx menjadi sub-komponen per seksi"
```

---

### Task 12: Pecah ModalTambahBarang.tsx (1.186 baris)

**Files:**
- Create: `src/components/ModalTambahBarangForm.tsx` — form field dasar barang (nama, kategori, satuan, harga beli)
- Create: `src/components/ModalTambahBarangRoll.tsx` — seksi roll variant (lebar, panjang, harga per m2) — hanya muncul jika butuh_dimensi_status = 1
- Modify: `src/components/ModalTambahBarang.tsx` — orchestrator + modal shell

- [ ] **Step 1: Ekstrak ModalTambahBarangForm.tsx**

Pindahkan semua field dasar barang. Props: `{ data, onChange, categories, subcategories, units, disabled }`

- [ ] **Step 2: Ekstrak ModalTambahBarangRoll.tsx**

Pindahkan semua logika dan UI roll variant. Props: `{ variants, onChange, disabled }`

- [ ] **Step 3: Slim down ModalTambahBarang.tsx**

Hanya berisi: modal shell, state management, submit handler, dan render dua komponen di atas.
Target: < 200 baris.

- [ ] **Step 4: Type-check dan build**

```bash
npm run type-check && npm run build
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/ModalTambahBarang.tsx src/components/ModalTambahBarangForm.tsx src/components/ModalTambahBarangRoll.tsx
git commit -m "refactor: pecah ModalTambahBarang.tsx menjadi sub-komponen"
```

---

### Task 13: Pecah pos/page.tsx (2.083 baris)

**Files:**
- Create: `src/app/pos/RiwayatPenjualanTab.tsx` — tab riwayat transaksi
- Create: `src/app/pos/PiutangTab.tsx` — tab daftar piutang / tagihan
- Modify: `src/app/pos/page.tsx` — hanya tab router + kasir utama (keranjang + barang picker)

- [ ] **Step 1: Ekstrak RiwayatPenjualanTab.tsx**

Pindahkan semua state, fetch, filter, dan JSX untuk tab riwayat ke file baru.
Props: `{ onNotifikasi: (msg: string, type: string) => void }`

- [ ] **Step 2: Ekstrak PiutangTab.tsx**

Pindahkan semua state, fetch, dan JSX untuk tab piutang ke file baru.
Props: `{ onNotifikasi: (msg: string, type: string) => void }`

- [ ] **Step 3: Slim down pos/page.tsx**

Hanya berisi tab navigation + kasir utama (komponen KeranjangPOS yang sudah ada).
Target: < 300 baris.

- [ ] **Step 4: Type-check dan build**

```bash
npm run type-check && npm run build
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/pos/
git commit -m "refactor: pecah pos/page.tsx menjadi tab components terpisah"
```

---
## Fase 8: Pecah keuangan/page.tsx (2.049 baris)

### Task 14: Pecah keuangan/page.tsx menjadi tab components

**Files:**
- Create: `src/app/keuangan/BukuKasTab.tsx` — tabel buku kas, filter, tambah entri manual
- Create: `src/app/keuangan/RingkasanTab.tsx` — summary cards formula-driven, grafik
- Create: `src/app/keuangan/BagiHasilTab.tsx` — kalkulasi bagi hasil per orang
- Modify: `src/app/keuangan/page.tsx` — tab router tipis + shared state (bulan/tahun aktif)

- [ ] **Step 1: Ekstrak BukuKasTab.tsx**

Pindahkan semua state, fetch, filter periode, dan JSX tabel buku kas ke file baru.
Props: `{ bulan: number, tahun: number, onNotifikasi: (n: NotificationToastProps) => void }`

- [ ] **Step 2: Ekstrak RingkasanTab.tsx**

Pindahkan kalkulasi summary, formula cards, dan grafik ke file baru.
Props: `{ bulan: number, tahun: number }`

- [ ] **Step 3: Ekstrak BagiHasilTab.tsx**

Pindahkan semua logika dan UI bagi hasil ke file baru.
Props: `{ bulan: number, tahun: number, onNotifikasi: (n: NotificationToastProps) => void }`

- [ ] **Step 4: Slim down keuangan/page.tsx**

Hanya berisi: state bulan/tahun, tab navigation bar, conditional render tiga tab.
Target: < 100 baris.

- [ ] **Step 5: Type-check dan build**

```bash
npm run type-check && npm run build
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/keuangan/
git commit -m "refactor: pecah keuangan/page.tsx menjadi tab components"
```

---

## Fase 9: Verifikasi Akhir

### Task 15: Full verification pass

**Files:** tidak ada perubahan, hanya verifikasi.

- [ ] **Step 1: Hitung total baris setelah semua refactor**

```bash
find src -name "*.ts" -o -name "*.tsx" | xargs wc -l 2>/dev/null | sort -rn | head -20
```
Target: tidak ada file single yang > 1.500 baris (kecuali yang memang kompleks seperti finance AST).

- [ ] **Step 2: Pastikan tidak ada dead code baru**

```bash
grep -r "BagiHasilManageModal|useAsyncData" src/ --include="*.ts" --include="*.tsx"
```
Expected: tidak ada output.

- [ ] **Step 3: Pastikan tidak ada console.log di production code**

```bash
grep -r "console.log" src/ --include="*.ts" --include="*.tsx" | grep -v "__tests__" | grep -v ".test."
```
Expected: tidak ada output.

- [ ] **Step 4: Full type-check**

```bash
npm run type-check
```
Expected: 0 errors.

- [ ] **Step 5: Full test suite**

```bash
npx jest
```
Expected: semua test pass.

- [ ] **Step 6: Production build**

```bash
npm run build
```
Expected: build sukses, tidak ada warning baru.

- [ ] **Step 7: Commit akhir**

```bash
git add -A
git commit -m "chore: verifikasi akhir cleanup — semua file bersih dan build sukses"
```

---

## Ringkasan Perubahan

| Fase | Aksi | File Terdampak | Estimasi Pengurangan |
|------|------|---------------|---------------------|
| 1 | Hapus dead code | 2 file dihapus | -1.650 baris |
| 2 | Fix N+1 query | materials-service.ts | performa +++ |
| 3 | Bersihkan console.log | 8 file | kualitas +++ |
| 4 | Migrasi Flutter + hapus shims | 30+ file dihapus | -300 baris |
| 5 | Pecah db-unified.ts | 1 -> 3 file | lebih mudah dibaca |
| 6 | Pecah pengaturan/page.tsx | 1 -> 4 file | -3.500 baris dari 1 file |
| 7 | Pecah pos-service + purchases-service | 2 -> 6 file | lebih mudah di-maintain |
| 8 | Pecah komponen UI besar | 4 file -> 10 file | max 300 baris per file |
| 9 | Verifikasi akhir | — | — |

**Total estimasi pengurangan per file:** dari max 4.834 baris menjadi max ~800 baris per file.
