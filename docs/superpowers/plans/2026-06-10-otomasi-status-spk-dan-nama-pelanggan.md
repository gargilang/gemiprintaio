# Otomasi Status SPK + Nama Pelanggan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modal Detail SPK mendapat otomasi status order (derive dari item, override reset-otomatis), status item per jenis (cetak vs maklon) yang ramah manusia, cascade SELESAI yang aman, plus editor nama pelanggan yang tersimpan & sinkron dua arah dengan prompt cetak faktur POS.

**Architecture:** Satu konstanta terpusat `status-produksi.ts` (daftar status + label + warna + helper murni `deriveOrderStatus`). Validasi via Zod (CHECK constraint dilepas). Logika derivasi & cascade di `production-service.ts`. UI di `SpkDetailModal.tsx`. Nama pelanggan disimpan ke kolom `penjualan` yang sudah ada (`pelanggan_id` / `pelanggan_nama_snapshot`) lewat action baru, dipakai dua sisi (SPK + Riwayat Penjualan).

**Tech Stack:** Next.js (App Router, server actions), TypeScript, Zod, db-unified (Supabase + SQLite), Jest (project `node`), SWR (`useCachedData` / `useInvalidate`).

---

## File Structure

**New files:**
- `src/lib/produksi/status-produksi.ts` — sumber kebenaran status (daftar per jenis, label, warna, helper klasifikasi, `deriveOrderStatus`).
- `src/lib/schemas/produksi.ts` — Zod schema status item + order.
- `src/lib/__tests__/status-produksi.test.ts` — unit test untuk helper murni + `deriveOrderStatus`.
- `src/lib/__tests__/production-customer-name.test.ts` — unit test `updateSaleCustomer`.
- `supabase/migrations/20260610090000_spk_status_override_lepas_check.sql` — kolom `status_override_manual` + DROP CHECK.

**Modified files:**
- `src/lib/services/production-service.ts` — `is_maklon` di item, derivasi saat item berubah, `setOrderStatusSelesaiCascade`, `updateSaleCustomer`, longgarkan tipe status.
- `src/app/produksi/spk/actions.ts` — auth guard + action baru (`setOrderStatusSelesaiCascadeAction`, `updateSaleCustomerAction`), tipe status longgar.
- `src/app/produksi/spk/components/SpkDetailModal.tsx` — dropdown per jenis item, label ramah manusia, dialog cascade, editor nama pelanggan.
- `src/app/produksi/spk/components/spk-status.ts` — re-ekspor dari konstanta terpusat (hindari duplikasi).
- `src/app/produksi/spk/page.tsx` — handler cascade SELESAI, editor nama, invalidasi cache.
- `src/app/api/produksi/[id]/route.ts` + `src/app/api/produksi/items/[itemId]/route.ts` — pakai Zod enum terpusat.
- `src/components/TabelRiwayatPenjualan.tsx` — prompt cetak menyimpan nama via action.
- `database/sqlite-schema.sql` — kolom baru + hapus CHECK status item.
- `src/lib/db-sqlite-migrations.ts` — ADD COLUMN + rebuild `item_produksi` tanpa CHECK status.

---

### Task 1: Konstanta status terpusat + `deriveOrderStatus`

**Files:**
- Create: `src/lib/produksi/status-produksi.ts`
- Test: `src/lib/__tests__/status-produksi.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

Create `src/lib/__tests__/status-produksi.test.ts`:

```typescript
import {
  STATUS_ITEM_CETAK,
  STATUS_ITEM_MAKLON,
  labelStatus,
  daftarStatusUntukItem,
  deriveOrderStatus,
  adalahStatusTerminal,
} from "@/lib/produksi/status-produksi";

describe("status-produksi konstanta", () => {
  it("urutan cetak: MENUNGGU pertama, DIBATALKAN terakhir", () => {
    expect(STATUS_ITEM_CETAK[0]).toBe("MENUNGGU");
    expect(STATUS_ITEM_CETAK[STATUS_ITEM_CETAK.length - 1]).toBe("DIBATALKAN");
  });

  it("maklon memuat status pengiriman", () => {
    expect(STATUS_ITEM_MAKLON).toEqual([
      "MENUNGGU",
      "TUNGGU_KONFIRMASI",
      "BAHAN_HABIS",
      "PESAN_KURIR",
      "TUNGGU_KURIR",
      "SEDANG_DIKIRIM",
      "DIKERJAKAN_VENDOR",
      "SEDANG_DIAMBIL",
      "SIAP_AMBIL",
      "SELESAI",
      "DIBATALKAN",
    ]);
  });

  it("labelStatus ramah manusia tanpa underscore", () => {
    expect(labelStatus("TUNGGU_KONFIRMASI")).toBe("Tunggu Konfirmasi");
    expect(labelStatus("SEDANG_DIAMBIL")).toBe("Sedang Diambil");
    expect(labelStatus("PRINTING")).toBe("Printing");
    // fallback humanize untuk kode tak terdaftar
    expect(labelStatus("FOO_BAR")).toBe("Foo Bar");
    expect(labelStatus("FOO_BAR")).not.toContain("_");
  });

  it("daftarStatusUntukItem memilih daftar sesuai jenis", () => {
    expect(daftarStatusUntukItem({ is_maklon: true })).toBe(STATUS_ITEM_MAKLON);
    expect(daftarStatusUntukItem({ is_maklon: false })).toBe(STATUS_ITEM_CETAK);
  });

  it("adalahStatusTerminal", () => {
    expect(adalahStatusTerminal("SELESAI")).toBe(true);
    expect(adalahStatusTerminal("DIBATALKAN")).toBe(true);
    expect(adalahStatusTerminal("PRINTING")).toBe(false);
  });
});

describe("deriveOrderStatus", () => {
  it("semua MENUNGGU -> MENUNGGU", () => {
    expect(deriveOrderStatus(["MENUNGGU", "MENUNGGU"])).toBe("MENUNGGU");
  });
  it("ada satu bergerak -> PROSES", () => {
    expect(deriveOrderStatus(["MENUNGGU", "PRINTING"])).toBe("PROSES");
  });
  it("status macet dihitung bergerak -> PROSES", () => {
    expect(deriveOrderStatus(["MENUNGGU", "BAHAN_HABIS"])).toBe("PROSES");
  });
  it("semua SELESAI -> SELESAI", () => {
    expect(deriveOrderStatus(["SELESAI", "SELESAI"])).toBe("SELESAI");
  });
  it("item DIBATALKAN diabaikan saat menilai selesai", () => {
    expect(deriveOrderStatus(["SELESAI", "DIBATALKAN"])).toBe("SELESAI");
  });
  it("semua DIBATALKAN -> DIBATALKAN", () => {
    expect(deriveOrderStatus(["DIBATALKAN", "DIBATALKAN"])).toBe("DIBATALKAN");
  });
  it("sebagian SELESAI sebagian MENUNGGU -> PROSES", () => {
    expect(deriveOrderStatus(["SELESAI", "MENUNGGU"])).toBe("PROSES");
  });
  it("daftar kosong -> MENUNGGU", () => {
    expect(deriveOrderStatus([])).toBe("MENUNGGU");
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx jest status-produksi --silent`
Expected: FAIL ("Cannot find module '@/lib/produksi/status-produksi'").

- [ ] **Step 3: Implementasi konstanta**

Create `src/lib/produksi/status-produksi.ts`:

```typescript
/**
 * Sumber kebenaran tunggal untuk semua status produksi (SPK).
 *
 * Status item dibedakan per jenis: item cetak-sendiri (in-house) vs item
 * maklon (dikerjakan vendor luar). Status order diturunkan otomatis dari
 * status semua itemnya via {@link deriveOrderStatus}.
 *
 * Validasi nilai dilakukan di aplikasi (Zod, lihat src/lib/schemas/produksi.ts);
 * CHECK constraint DB sengaja dilepas agar menambah status cukup edit file ini.
 * Label SELALU ditampilkan ramah manusia (tanpa underscore) di UI.
 */

export type OrderStatus = "MENUNGGU" | "PROSES" | "SELESAI" | "DIBATALKAN";

/** Status item cetak-sendiri, terurut atas (awal) -> bawah (akhir). */
export const STATUS_ITEM_CETAK = [
  "MENUNGGU",
  "TUNGGU_KONFIRMASI",
  "BAHAN_HABIS",
  "PRINTING",
  "FINISHING",
  "SIAP_AMBIL",
  "SELESAI",
  "DIBATALKAN",
] as const;

/** Status item maklon (vendor luar), terurut atas -> bawah. */
export const STATUS_ITEM_MAKLON = [
  "MENUNGGU",
  "TUNGGU_KONFIRMASI",
  "BAHAN_HABIS",
  "PESAN_KURIR",
  "TUNGGU_KURIR",
  "SEDANG_DIKIRIM",
  "DIKERJAKAN_VENDOR",
  "SEDANG_DIAMBIL",
  "SIAP_AMBIL",
  "SELESAI",
  "DIBATALKAN",
] as const;

/** Status order, terurut. */
export const STATUS_ORDER = [
  "MENUNGGU",
  "PROSES",
  "SELESAI",
  "DIBATALKAN",
] as const;

/** Semua nilai status item yang valid (gabungan cetak ∪ maklon), unik. */
export const SEMUA_STATUS_ITEM: string[] = Array.from(
  new Set<string>([...STATUS_ITEM_CETAK, ...STATUS_ITEM_MAKLON])
);

/** Label tampilan Bahasa Indonesia per kode status. */
const LABEL_STATUS: Record<string, string> = {
  MENUNGGU: "Menunggu",
  TUNGGU_KONFIRMASI: "Tunggu Konfirmasi",
  BAHAN_HABIS: "Bahan Habis",
  PRINTING: "Printing",
  FINISHING: "Finishing",
  PESAN_KURIR: "Pesan Kurir",
  TUNGGU_KURIR: "Tunggu Kurir",
  SEDANG_DIKIRIM: "Sedang Dikirim",
  DIKERJAKAN_VENDOR: "Dikerjakan Vendor",
  SEDANG_DIAMBIL: "Sedang Diambil",
  SIAP_AMBIL: "Siap Diambil",
  SELESAI: "Selesai",
  DIBATALKAN: "Dibatalkan",
  PROSES: "Proses",
};

/** Ubah SCREAMING_SNAKE_CASE -> "Title Case" (fallback tanpa underscore). */
function humanize(kode: string): string {
  return kode
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((k) => k.charAt(0).toUpperCase() + k.slice(1))
    .join(" ");
}

/** Label ramah manusia; selalu tanpa underscore. */
export function labelStatus(kode: string | null | undefined): string {
  if (!kode) return "-";
  return LABEL_STATUS[kode] || humanize(kode);
}

/** Daftar status sesuai jenis item. */
export function daftarStatusUntukItem(item: {
  is_maklon?: boolean | null;
}): readonly string[] {
  return item.is_maklon ? STATUS_ITEM_MAKLON : STATUS_ITEM_CETAK;
}

/** Status terminal (tidak bergerak lagi). */
export function adalahStatusTerminal(kode: string): boolean {
  return kode === "SELESAI" || kode === "DIBATALKAN";
}

/**
 * Turunkan status order dari status semua itemnya.
 * - item DIBATALKAN diabaikan saat menilai selesai/jalan (bukan penghalang)
 * - semua non-batal SELESAI -> SELESAI
 * - tidak ada item non-batal -> DIBATALKAN
 * - ada minimal satu non-batal yang bergerak dari MENUNGGU -> PROSES
 * - selain itu -> MENUNGGU
 */
export function deriveOrderStatus(statuses: string[]): OrderStatus {
  if (statuses.length === 0) return "MENUNGGU";
  const nonBatal = statuses.filter((s) => s !== "DIBATALKAN");
  if (nonBatal.length === 0) return "DIBATALKAN";
  if (nonBatal.every((s) => s === "SELESAI")) return "SELESAI";
  const adaBergerak = nonBatal.some((s) => s !== "MENUNGGU");
  return adaBergerak ? "PROSES" : "MENUNGGU";
}

/** Warna badge per status (Tailwind, dengan pasangan dark mode). */
export function warnaStatus(kode: string): string {
  switch (kode) {
    case "MENUNGGU":
      return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-300";
    case "PROSES":
      return "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-300";
    case "SELESAI":
      return "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-300";
    case "DIBATALKAN":
      return "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300";
    case "PRINTING":
      return "bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 border-purple-300";
    case "FINISHING":
      return "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 border-orange-300";
    case "TUNGGU_KONFIRMASI":
      return "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-300";
    case "BAHAN_HABIS":
      return "bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200 border-rose-300";
    case "PESAN_KURIR":
    case "TUNGGU_KURIR":
      return "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-200 border-cyan-300";
    case "SEDANG_DIKIRIM":
    case "SEDANG_DIAMBIL":
      return "bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-200 border-sky-300";
    case "DIKERJAKAN_VENDOR":
      return "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 border-indigo-300";
    case "SIAP_AMBIL":
      return "bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200 border-teal-300";
    default:
      return "bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-slate-100 border-gray-300";
  }
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `npx jest status-produksi --silent`
Expected: PASS (semua kasus hijau).

- [ ] **Step 5: Commit**

```bash
git add src/lib/produksi/status-produksi.ts src/lib/__tests__/status-produksi.test.ts
git commit -m "feat(produksi): konstanta status terpusat + deriveOrderStatus"
```

<!-- M:T1 -->
### Task 2: Zod schema status produksi

**Files:**
- Create: `src/lib/schemas/produksi.ts`
- Test: tambahan di `src/lib/__tests__/status-produksi.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

Append ke `src/lib/__tests__/status-produksi.test.ts`:

```typescript
import {
  itemStatusSchema,
  orderStatusSchema,
} from "@/lib/schemas/produksi";

describe("schema produksi", () => {
  it("itemStatusSchema menerima nilai valid", () => {
    expect(itemStatusSchema.safeParse("PESAN_KURIR").success).toBe(true);
    expect(itemStatusSchema.safeParse("PRINTING").success).toBe(true);
  });
  it("itemStatusSchema menolak nilai ngawur", () => {
    expect(itemStatusSchema.safeParse("NGAWUR").success).toBe(false);
  });
  it("orderStatusSchema valid/invalid", () => {
    expect(orderStatusSchema.safeParse("PROSES").success).toBe(true);
    expect(orderStatusSchema.safeParse("PRINTING").success).toBe(false);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx jest status-produksi --silent`
Expected: FAIL ("Cannot find module '@/lib/schemas/produksi'").

- [ ] **Step 3: Implementasi schema**

Create `src/lib/schemas/produksi.ts`:

```typescript
import { z } from "zod";
import {
  SEMUA_STATUS_ITEM,
  STATUS_ORDER,
} from "@/lib/produksi/status-produksi";

/** Status item produksi (gabungan cetak ∪ maklon). */
export const itemStatusSchema = z.enum(
  SEMUA_STATUS_ITEM as [string, ...string[]]
);

/** Status order produksi. */
export const orderStatusSchema = z.enum(
  STATUS_ORDER as unknown as [string, ...string[]]
);

/** Payload update status item dari klien. */
export const updateItemStatusSchema = z.object({
  status: itemStatusSchema,
  operator_id: z.string().optional(),
});

/** Payload update nama pelanggan sebuah penjualan (salah satu terisi). */
export const updateSaleCustomerSchema = z
  .object({
    pelanggan_id: z.string().nullish(),
    pelanggan_nama_snapshot: z.string().nullish(),
  })
  .refine(
    (v) =>
      (v.pelanggan_id != null && v.pelanggan_id !== "") ||
      (v.pelanggan_nama_snapshot != null &&
        v.pelanggan_nama_snapshot.trim() !== ""),
    { message: "Isi nama pelanggan atau pilih pelanggan terdaftar" }
  );
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `npx jest status-produksi --silent`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas/produksi.ts src/lib/__tests__/status-produksi.test.ts
git commit -m "feat(produksi): Zod schema status item/order + nama pelanggan"
```

<!-- M:T2 -->
### Task 3: Migrasi skema (kolom override + lepas CHECK)

**Files:**
- Create: `supabase/migrations/20260610090000_spk_status_override_lepas_check.sql`
- Modify: `database/sqlite-schema.sql` (kolom baru + hapus CHECK status item)
- Modify: `src/lib/db-sqlite-migrations.ts` (ADD COLUMN + rebuild item_produksi)

- [ ] **Step 1: Tulis migrasi Supabase**

Create `supabase/migrations/20260610090000_spk_status_override_lepas_check.sql`:

```sql
-- Otomasi status SPK: tandai override manual + lepas CHECK status produksi.
-- Status sekarang divalidasi di aplikasi (Zod) supaya menambah status baru
-- tidak perlu migrasi enum. Lihat src/lib/produksi/status-produksi.ts.

-- 1. Kolom penanda override manual pada order.
ALTER TABLE order_produksi
  ADD COLUMN IF NOT EXISTS status_override_manual boolean NOT NULL DEFAULT false;

-- 2. Lepas CHECK constraint status item & order (cari nama constraint runtime).
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname, rel.relname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE con.contype = 'c'
      AND rel.relname IN ('item_produksi', 'order_produksi')
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', c.relname, c.conname);
  END LOOP;
END $$;
```

- [ ] **Step 2: Update template SQLite fresh-install**

In `database/sqlite-schema.sql`, find the `item_produksi` `status` column (line ~635):

```sql
      status TEXT DEFAULT 'MENUNGGU' CHECK(status IN ('MENUNGGU', 'PRINTING', 'FINISHING', 'SELESAI')),
```

Replace with (hapus CHECK; validasi di aplikasi):

```sql
      status TEXT DEFAULT 'MENUNGGU',
```

Then find the `order_produksi` block (line ~807-823) and add the new column right after the existing `status` line (line ~813). The existing line:

```sql
      status TEXT DEFAULT 'MENUNGGU' CHECK(status IN ('MENUNGGU', 'PROSES', 'SELESAI', 'DIBATALKAN')),
```

Replace with (hapus CHECK + tambah kolom override tepat di bawahnya):

```sql
      status TEXT DEFAULT 'MENUNGGU',
      status_override_manual INTEGER NOT NULL DEFAULT 0,
```

- [ ] **Step 3: Tambah runtime migration SQLite (ADD COLUMN + rebuild)**

In `src/lib/db-sqlite-migrations.ts`, near the existing `item_produksi` ALTER (line ~1005), add a new idempotent block. First the simple ADD COLUMN for the override flag:

```typescript
  // Otomasi status SPK: kolom penanda override manual pada order_produksi.
  const orderCols = db.prepare(`PRAGMA table_info(order_produksi)`).all() as Array<{ name: string }>;
  if (!orderCols.some((c) => c.name === "status_override_manual")) {
    db.exec(
      `ALTER TABLE order_produksi ADD COLUMN status_override_manual INTEGER NOT NULL DEFAULT 0`
    );
  }
```

Then rebuild `item_produksi` to drop the CHECK on `status` (SQLite can't drop CHECK in place). Guard it so it only runs once by checking whether the current table DDL still contains the CHECK:

```typescript
  // Lepas CHECK status pada item_produksi (SQLite tak bisa DROP CHECK langsung).
  // Rebuild tabel sekali; di-skip bila CHECK sudah tidak ada.
  const itemProduksiDDL = (
    db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type='table' AND name='item_produksi'`
      )
      .get() as { sql?: string } | undefined
  )?.sql;
  if (itemProduksiDDL && /CHECK\s*\(\s*status\s+IN/i.test(itemProduksiDDL)) {
    const cols = db.prepare(`PRAGMA table_info(item_produksi)`).all() as Array<{ name: string }>;
    const colNames = cols.map((c) => c.name).join(", ");
    const rebuild = db.transaction(() => {
      db.pragma("foreign_keys = OFF");
      // DDL baru: salin dari template tanpa CHECK status. Pertahankan kolom & urutan
      // dengan menyalin via SELECT (kolom sama). Buat tabel baru tanpa CHECK status.
      const newDDL = itemProduksiDDL
        .replace(/CREATE TABLE\s+item_produksi/i, "CREATE TABLE item_produksi__new")
        .replace(
          /status\s+TEXT\s+DEFAULT\s+'MENUNGGU'\s+CHECK\s*\(\s*status\s+IN\s*\([^)]*\)\)/i,
          "status TEXT DEFAULT 'MENUNGGU'"
        );
      db.exec(newDDL);
      db.exec(
        `INSERT INTO item_produksi__new (${colNames}) SELECT ${colNames} FROM item_produksi`
      );
      db.exec(`DROP TABLE item_produksi`);
      db.exec(`ALTER TABLE item_produksi__new RENAME TO item_produksi`);
      db.pragma("foreign_keys = ON");
    });
    rebuild();
  }
```

- [ ] **Step 4: Verifikasi node --check pada file migrasi TS**

Run: `node --check src/lib/db-sqlite-migrations.ts`
Expected: no output (sintaks valid). Jika tool tidak mendukung TS langsung, lewati dan andalkan `npm run type-check` di akhir.

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260610090000_spk_status_override_lepas_check.sql database/sqlite-schema.sql src/lib/db-sqlite-migrations.ts
git commit -m "feat(produksi): kolom status_override_manual + lepas CHECK status (validasi pindah ke Zod)"
```

<!-- M:T3 -->
### Task 4: Service — `is_maklon`, derivasi, cascade, updateSaleCustomer

**Files:**
- Modify: `src/lib/services/production-service.ts`
- Test: `src/lib/__tests__/production-customer-name.test.ts`

This task changes the service layer. Split into focused steps.

- [ ] **Step 1: Longgarkan tipe status di interface**

In `src/lib/services/production-service.ts`, change `ProductionOrder.status` (line 24) and `ProductionItem.status` (line 52) to `string`, and add `is_maklon` to `ProductionItem`. Replace line 24:

```typescript
  status: string;
```

Replace line 52:

```typescript
  status: string;
```

Add after line 61 (`consumption?: ...`), inside `ProductionItem`:

```typescript
  is_maklon?: boolean;
  status_override_manual?: boolean;
```

(Note: `status_override_manual` belongs on the order; add it to `ProductionOrder` interface instead — after line 31 `diselesaikan_pada`:)

```typescript
  status_override_manual?: boolean;
```

Keep `is_maklon` on `ProductionItem` only.

- [ ] **Step 2: Surface `is_maklon` saat enrich item (kedua jalur)**

In `getProductionOrders`, in the item mapping (the `return { ...item, ... }` block at line ~218-233), add `is_maklon` derived from the joined `saleItem.tipe_item`:

```typescript
            return {
              ...item,
              is_maklon: saleItem?.tipe_item === "MAKLON",
              barang_id: (item as any).barang_id || saleItem?.barang_id || null,
```

Do the same in `getProductionOrderById` (the `return { ...item, ... }` block at line ~348-363):

```typescript
        return {
          ...item,
          is_maklon: saleItem?.tipe_item === "MAKLON",
          barang_id: (item as any).barang_id || saleItem?.barang_id || null,
```

- [ ] **Step 3: Helper internal — recompute order status dari item (hormati override)**

Add a new exported function near `updateProductionOrderStatus` (after line 601). It reads all items of an order, derives, and applies the override rule:

```typescript
import { deriveOrderStatus } from "@/lib/produksi/status-produksi";
```

(Add that import at the top of the file with the other imports.)

Then add:

```typescript
/**
 * Hitung ulang status order dari status semua itemnya, hormati override manual.
 * - override false  -> selalu samakan ke hasil derivasi
 * - override true   -> hanya matikan override bila derivasi sudah == status saat ini
 *                      (reset-otomatis); selain itu status order dibiarkan.
 */
export async function recomputeOrderStatusFromItems(
  orderId: string
): Promise<void> {
  const orderRes = await db.queryOne<any>("order_produksi", {
    where: { id: orderId },
  });
  const order = orderRes.data;
  if (!order) return;

  const itemsRes = await db.query<any>("item_produksi", {
    where: { order_produksi_id: orderId },
  });
  const statuses = (itemsRes.data || []).map((i: any) => String(i.status));
  const derived = deriveOrderStatus(statuses);

  const overrideOn =
    order.status_override_manual === 1 ||
    order.status_override_manual === true;

  if (!overrideOn) {
    const patch: any = { status: derived };
    if (derived === "SELESAI") patch.diselesaikan_pada = new Date().toISOString();
    await db.update("order_produksi", orderId, patch);
    return;
  }

  // Override aktif: reset-otomatis bila derivasi kembali selaras.
  if (derived === String(order.status)) {
    await db.update("order_produksi", orderId, {
      status_override_manual: 0,
    });
  }
  // derivasi != status saat ini -> hormati override, jangan sentuh status.
}
```

- [ ] **Step 4: Panggil recompute setelah item status berubah**

In `updateProductionItemStatus` (line 843-901), after the successful `db.update("item_produksi", ...)` (line 890) and before `return true` (line 896), fetch the item's order id and recompute:

```typescript
    if (result.error) {
      throw result.error;
    }

    // Otomasi: hitung ulang status order dari item (hormati override manual).
    const ownerRes = await db.queryOne<any>("item_produksi", {
      where: { id: itemId },
    });
    const orderId = ownerRes.data?.order_produksi_id;
    if (orderId) {
      await recomputeOrderStatusFromItems(orderId);
    }

    return true;
```

- [ ] **Step 5: Order status manual menyalakan override**

Modify `updateProductionOrderStatus` (line 577-601) to also set `status_override_manual = 1` when called directly (this path is the manual dropdown). Replace the `updateData` build (line 582-588):

```typescript
    const updateData: any = {
      status,
      status_override_manual: 1,
    };

    if (status === "SELESAI") {
      updateData.diselesaikan_pada = new Date().toISOString();
    }
```

- [ ] **Step 6: Fungsi cascade SELESAI**

Add a new function after `recomputeOrderStatusFromItems`. It marks each non-terminal item SELESAI, skips roll-blocked ones, then recomputes:

```typescript
/**
 * Set order = SELESAI manual dengan cascade ke item.
 * Tiap item non-terminal dicoba di-SELESAI-kan via updateProductionItemStatus
 * (menghormati aturan roll PENDING). Item yang terhalang dilewati & dilaporkan.
 * Setelah cascade, status order dihitung ulang (bisa jatuh ke PROSES bila masih
 * ada item belum selesai) — mencegah SELESAI palsu.
 */
export async function setOrderStatusSelesaiCascade(orderId: string): Promise<{
  selesai: string[];
  terhalang: { id: string; nama: string }[];
  statusOrderAkhir: string;
}> {
  const itemsRes = await db.query<any>("item_produksi", {
    where: { order_produksi_id: orderId },
  });
  const items = itemsRes.data || [];

  const selesai: string[] = [];
  const terhalang: { id: string; nama: string }[] = [];

  for (const item of items) {
    if (item.status === "SELESAI" || item.status === "DIBATALKAN") continue;
    try {
      await updateProductionItemStatus(item.id, { status: "SELESAI" });
      selesai.push(item.id);
    } catch {
      // Terhalang (mis. roll PENDING belum dikonfirmasi).
      terhalang.push({ id: item.id, nama: String(item.barang_nama || item.id) });
    }
  }

  // updateProductionItemStatus sudah memanggil recompute per item, tapi panggil
  // sekali lagi untuk memastikan status order final konsisten.
  await recomputeOrderStatusFromItems(orderId);
  const orderRes = await db.queryOne<any>("order_produksi", {
    where: { id: orderId },
  });
  return {
    selesai,
    terhalang,
    statusOrderAkhir: String(orderRes.data?.status || "MENUNGGU"),
  };
}
```

Note: because `updateProductionItemStatus` now triggers recompute and the items aren't override-blocked at item level, after cascade the order will be SELESAI only if all non-batal items reached SELESAI; otherwise it derives to PROSES. The earlier manual `status_override_manual=1` set by the dropdown is reset automatically by `recomputeOrderStatusFromItems` when derived matches.

- [ ] **Step 7: Fungsi updateSaleCustomer**

Add near the end of the file (before the final closing if any helper section). It writes to `penjualan`:

```typescript
/**
 * Set nama pelanggan sebuah penjualan: pelanggan terdaftar (pelanggan_id) ATAU
 * nama bebas (pelanggan_nama_snapshot). Sisi yang tidak dipakai di-null-kan.
 * Dipakai dari modal SPK maupun prompt cetak faktur di Riwayat Penjualan.
 */
export async function updateSaleCustomer(
  penjualanId: string,
  data: { pelanggan_id?: string | null; pelanggan_nama_snapshot?: string | null }
): Promise<boolean> {
  const usePelangganId = !!(data.pelanggan_id && data.pelanggan_id.trim());
  const patch = usePelangganId
    ? { pelanggan_id: data.pelanggan_id!.trim(), pelanggan_nama_snapshot: null }
    : {
        pelanggan_id: null,
        pelanggan_nama_snapshot:
          data.pelanggan_nama_snapshot?.trim() || null,
      };
  const result = await db.update("penjualan", penjualanId, patch);
  if (result.error) throw result.error;
  return true;
}
```

- [ ] **Step 8: Tulis test updateSaleCustomer**

Create `src/lib/__tests__/production-customer-name.test.ts`:

```typescript
import { updateSaleCustomer } from "@/lib/services/production-service";

const updateMock = jest.fn();

jest.mock("@/lib/db-unified", () => ({
  db: {
    update: (...args: any[]) => updateMock(...args),
  },
}));

describe("updateSaleCustomer", () => {
  beforeEach(() => updateMock.mockReset().mockResolvedValue({ error: null }));

  it("nama bebas -> snapshot, pelanggan_id null", async () => {
    await updateSaleCustomer("jual-1", { pelanggan_nama_snapshot: "Pak Budi" });
    expect(updateMock).toHaveBeenCalledWith("penjualan", "jual-1", {
      pelanggan_id: null,
      pelanggan_nama_snapshot: "Pak Budi",
    });
  });

  it("pilih terdaftar -> pelanggan_id, snapshot null", async () => {
    await updateSaleCustomer("jual-1", { pelanggan_id: "plg-9" });
    expect(updateMock).toHaveBeenCalledWith("penjualan", "jual-1", {
      pelanggan_id: "plg-9",
      pelanggan_nama_snapshot: null,
    });
  });
});
```

- [ ] **Step 9: Jalankan test, pastikan lolos**

Run: `npx jest production-customer-name --silent`
Expected: PASS (2 tests).

- [ ] **Step 10: Type-check + commit**

Run: `npm run type-check`
Expected: 0 error.

```bash
git add src/lib/services/production-service.ts src/lib/__tests__/production-customer-name.test.ts
git commit -m "feat(produksi): is_maklon, auto-derive status order, cascade SELESAI, updateSaleCustomer"
```

<!-- M:T4 -->
### Task 5: Server actions — guard + action baru

**Files:**
- Modify: `src/app/produksi/spk/actions.ts`

- [ ] **Step 1: Tambah import**

In `src/app/produksi/spk/actions.ts`, extend the service import (line 7-16) to add the new functions, and broaden the auth-guard import (line 17):

```typescript
import {
  getProductionOrders,
  getProductionOrderById,
  updateProductionOrderStatus,
  updateProductionItemStatus,
  getRollVariantsForProductionItem,
  postProductionMaterialConsumption,
  voidProductionMaterialConsumption,
  deleteProductionOrder,
  setOrderStatusSelesaiCascade,
  updateSaleCustomer,
} from "@/lib/services/production-service";
import {
  requireProductionInventoryRole,
  requireSession,
} from "@/lib/auth-guard-server";
import { updateItemStatusSchema, updateSaleCustomerSchema } from "@/lib/schemas/produksi";
import { AuthGuardError } from "@/lib/auth-guard-error";
```

- [ ] **Step 2: Guard + perbarui updateProductionStatusAction**

Replace `updateProductionStatusAction` (line 37-47):

```typescript
export async function updateProductionStatusAction(
  orderId: string,
  status: string
) {
  try {
    await requireProductionInventoryRole();
    return await updateProductionOrderStatus(orderId, status as any);
  } catch (error) {
    if (error instanceof AuthGuardError) throw error;
    console.error("Error in updateProductionStatusAction:", error);
    throw error;
  }
}
```

- [ ] **Step 3: Guard + validasi updateProductionItemStatusAction**

Replace `updateProductionItemStatusAction` (line 49-62):

```typescript
export async function updateProductionItemStatusAction(
  itemId: string,
  data: { status: string; operator_id?: string }
) {
  try {
    const s = await requireProductionInventoryRole();
    const parsed = updateItemStatusSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error("Status item tidak valid");
    }
    return await updateProductionItemStatus(itemId, {
      status: parsed.data.status as any,
      operator_id: parsed.data.operator_id || s.uid,
    });
  } catch (error) {
    if (error instanceof AuthGuardError) throw error;
    console.error("Error in updateProductionItemStatusAction:", error);
    throw error;
  }
}
```

- [ ] **Step 4: Action cascade SELESAI + updateSaleCustomer**

Add two new actions (after `updateProductionItemStatusAction`):

```typescript
export async function setOrderStatusSelesaiCascadeAction(orderId: string) {
  try {
    await requireProductionInventoryRole();
    return await setOrderStatusSelesaiCascade(orderId);
  } catch (error) {
    if (error instanceof AuthGuardError) throw error;
    console.error("Error in setOrderStatusSelesaiCascadeAction:", error);
    throw error;
  }
}

export async function updateSaleCustomerAction(
  penjualanId: string,
  data: { pelanggan_id?: string | null; pelanggan_nama_snapshot?: string | null }
) {
  try {
    await requireSession();
    const parsed = updateSaleCustomerSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message || "Data nama tidak valid");
    }
    return await updateSaleCustomer(penjualanId, parsed.data);
  } catch (error) {
    if (error instanceof AuthGuardError) throw error;
    console.error("Error in updateSaleCustomerAction:", error);
    throw error;
  }
}
```

- [ ] **Step 5: Type-check + commit**

Run: `npm run type-check`
Expected: 0 error.

```bash
git add src/app/produksi/spk/actions.ts
git commit -m "feat(produksi): guard status actions + action cascade SELESAI & updateSaleCustomer"
```

<!-- M:T5 -->
### Task 6: API routes pakai Zod enum terpusat

**Files:**
- Modify: `src/app/api/produksi/[id]/route.ts`
- Modify: `src/app/api/produksi/items/[itemId]/route.ts`

- [ ] **Step 1: Update order route validation**

In `src/app/api/produksi/[id]/route.ts`, replace the hardcoded `ORDER_STATUSES` array (line 6) and its usage with the Zod schema. Add import near top:

```typescript
import { orderStatusSchema } from "@/lib/schemas/produksi";
```

Remove the `const ORDER_STATUSES = [...]` line. Find the validation check inside `PATCH` (where it tests membership in `ORDER_STATUSES`) and replace with:

```typescript
    if (!orderStatusSchema.safeParse(status).success) {
      return NextResponse.json({ error: "Status tidak valid" }, { status: 422 });
    }
```

- [ ] **Step 2: Update item route validation**

In `src/app/api/produksi/items/[itemId]/route.ts`, replace the hardcoded `ITEM_STATUSES` array (line 6-11) and usage. Add import:

```typescript
import { itemStatusSchema } from "@/lib/schemas/produksi";
```

Remove the `const ITEM_STATUSES = [...]` block. Replace the membership check inside `PATCH` with:

```typescript
    if (!itemStatusSchema.safeParse(status).success) {
      return NextResponse.json({ error: "Status tidak valid" }, { status: 422 });
    }
```

- [ ] **Step 3: Type-check + commit**

Run: `npm run type-check`
Expected: 0 error.

```bash
git add src/app/api/produksi/[id]/route.ts src/app/api/produksi/items/[itemId]/route.ts
git commit -m "refactor(produksi): API route validasi status pakai Zod terpusat"
```

<!-- M:T6 -->
### Task 7: spk-status.ts re-ekspor dari konstanta terpusat

**Files:**
- Modify: `src/app/produksi/spk/components/spk-status.ts`

- [ ] **Step 1: Ganti isi agar pakai warna terpusat (hindari duplikasi)**

Replace the entire contents of `src/app/produksi/spk/components/spk-status.ts`:

```typescript
// Helper warna badge status & prioritas SPK.
// Status memakai sumber kebenaran terpusat di status-produksi.ts agar nilai
// baru (maklon, status macet) ikut berwarna tanpa duplikasi.
import { warnaStatus } from "@/lib/produksi/status-produksi";

export function getStatusColor(status: string): string {
  return warnaStatus(status);
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case "KILAT":
      return "bg-red-600 text-white";
    case "NORMAL":
      return "bg-blue-500 text-white";
    default:
      return "bg-gray-400 text-white";
  }
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npm run type-check`
Expected: 0 error.

```bash
git add src/app/produksi/spk/components/spk-status.ts
git commit -m "refactor(produksi): spk-status warna pakai konstanta terpusat"
```

<!-- M:T7 -->
### Task 8: Modal SPK — dropdown per jenis + label + editor nama

**Files:**
- Modify: `src/app/produksi/spk/components/SpkDetailModal.tsx`

- [ ] **Step 1: Perbarui import + tipe props**

At top of `SpkDetailModal.tsx`, add:

```typescript
import {
  STATUS_ORDER,
  daftarStatusUntukItem,
  labelStatus,
} from "@/lib/produksi/status-produksi";
```

In `SpkDetailModalProps` (line 25-42), loosen the status callback unions to `string` and add a customer-edit callback:

```typescript
  onUpdateItemStatus: (itemId: string, newStatus: string) => void;
  onUpdateOrderStatus: (orderId: string, newStatus: string) => void;
  onEditCustomer: () => void;
```

- [ ] **Step 2: Order status dropdown pakai konstanta + label**

Replace the order `<select>` options block (line 134-154) so value casts are gone and options are generated:

```jsx
              <select
                value={order.status}
                onChange={(e) => onUpdateOrderStatus(order.id, e.target.value)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border-2 cursor-pointer ${getStatusColor(
                  order.status
                )}`}
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {labelStatus(s)}
                  </option>
                ))}
              </select>
```

- [ ] **Step 3: Item status dropdown per jenis + label**

Replace the item `<select>` block (line 192-212) with one that picks the list by item type and shows human labels:

```jsx
                  <select
                    value={item.status}
                    onChange={(e) => onUpdateItemStatus(item.id, e.target.value)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border-2 cursor-pointer ${getStatusColor(
                      item.status
                    )}`}
                  >
                    {daftarStatusUntukItem({ is_maklon: item.is_maklon }).map(
                      (s) => (
                        <option key={s} value={s}>
                          {labelStatus(s)}
                        </option>
                      )
                    )}
                  </select>
```

- [ ] **Step 4: Pelanggan jadi bisa diedit**

Replace the "Pelanggan" info block (line 116-121) with a clickable editor trigger:

```jsx
            <div>
              <div className="text-sm text-gray-600 dark:text-slate-300 mb-1">Pelanggan</div>
              <button
                type="button"
                onClick={onEditCustomer}
                className="font-semibold text-left text-amber-700 dark:text-amber-300 hover:underline"
                title="Ubah nama pelanggan"
              >
                {order.pelanggan_nama || "Pelanggan Umum"}
                <span className="ml-1 text-xs text-gray-400">(ubah)</span>
              </button>
            </div>
```

- [ ] **Step 5: Type-check + commit**

Run: `npm run type-check`
Expected: 0 error (parent must pass `onEditCustomer`; that's Task 9, so type-check may flag the missing prop usage in `page.tsx` — proceed to Task 9 before committing if so).

```bash
git add src/app/produksi/spk/components/SpkDetailModal.tsx
git commit -m "feat(produksi): dropdown status per jenis item + label ramah manusia + trigger ubah pelanggan"
```

<!-- M:T8 -->
### Task 9: SPK page — cascade SELESAI + editor nama pelanggan + invalidasi

**Files:**
- Modify: `src/app/produksi/spk/page.tsx`
- Modify: `src/app/produksi/spk/actions.ts` (tambah list pelanggan ringkas)

The customer editor needs the list of registered customers. Add a tiny action first.

- [ ] **Step 1: Action daftar pelanggan ringkas**

In `src/app/produksi/spk/actions.ts`, add import + action:

```typescript
import { getPelanggan } from "@/lib/services/customers-service";
```

```typescript
export async function getPelangganRingkasAction() {
  try {
    const list = await getPelanggan();
    return list.map((p) => ({ id: p.id, nama: p.nama }));
  } catch (error) {
    console.error("Error in getPelangganRingkasAction:", error);
    throw error;
  }
}
```

- [ ] **Step 2: Import action baru + state editor di page**

In `src/app/produksi/spk/page.tsx`, extend the actions import (line 21-24 block) to include:

```typescript
  setOrderStatusSelesaiCascadeAction,
  updateSaleCustomerAction,
  getPelangganRingkasAction,
```

Add `useInvalidate` to the cached-data import (line 25):

```typescript
import { useCachedData, useInvalidate } from "@/lib/use-cached-data";
```

Inside `ProductionPage`, after the `useCachedData` block (line ~59), add:

```typescript
  const invalidate = useInvalidate();
  const [showCustomerEditor, setShowCustomerEditor] = useState(false);
  const [customerOptions, setCustomerOptions] = useState<
    { id: string; nama: string }[]
  >([]);
  const [customerNameInput, setCustomerNameInput] = useState("");
```

- [ ] **Step 3: Cascade-aware order status handler**

Replace `handleUpdateStatus` (line 196-209):

```typescript
  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    try {
      if (newStatus === "SELESAI") {
        const ok = window.confirm(
          "Tandai semua item produksi sebagai Selesai?"
        );
        if (!ok) return;
        const hasil = await setOrderStatusSelesaiCascadeAction(orderId);
        if (hasil.terhalang.length > 0) {
          const nama = hasil.terhalang.map((t) => t.nama).join(", ");
          showMsg(
            "error",
            `Item berikut belum bisa diselesaikan karena bahan roll belum dikonfirmasi: ${nama}. Konfirmasi bahannya dulu di item tersebut.`
          );
        } else {
          showMsg("success", "Semua item ditandai selesai");
        }
      } else {
        await updateProductionStatusAction(orderId, newStatus as any);
        showMsg("success", "Status berhasil diperbarui");
      }
      await loadOrders();
      await refreshSelectedOrder();
    } catch (error) {
      console.error("Error updating status:", error);
      showMsg("error", "Gagal memperbarui status");
    }
  };
```

- [ ] **Step 4: Loosen item status handler signature**

Replace `handleUpdateItemStatus` signature (line 211-213) so it accepts `string`:

```typescript
  const handleUpdateItemStatus = async (itemId: string, newStatus: string) => {
    try {
      await updateProductionItemStatusAction(itemId, { status: newStatus });
      showMsg("success", "Status item berhasil diperbarui");
      await loadOrders();
      await refreshSelectedOrder();
    } catch (error) {
      console.error("Error updating item status:", error);
      showMsg("error", "Gagal memperbarui status item");
    }
  };
```

- [ ] **Step 5: Customer editor open + save handlers**

Add after `handleUpdateItemStatus`:

```typescript
  const handleOpenCustomerEditor = async () => {
    if (!selectedOrder) return;
    setCustomerNameInput(selectedOrder.pelanggan_nama || "");
    if (customerOptions.length === 0) {
      try {
        const list = await getPelangganRingkasAction();
        setCustomerOptions(list);
      } catch {
        // biarkan kosong; operator masih bisa ketik nama bebas
      }
    }
    setShowCustomerEditor(true);
  };

  const handleSaveCustomerName = async (payload: {
    pelanggan_id?: string | null;
    pelanggan_nama_snapshot?: string | null;
  }) => {
    if (!selectedOrder) return;
    try {
      await updateSaleCustomerAction(selectedOrder.penjualan_id, payload);
      showMsg("success", "Nama pelanggan disimpan");
      setShowCustomerEditor(false);
      // Sinkron dua arah: bust cache SPK + Riwayat Penjualan (sales ada di pos-init).
      invalidate("production-orders");
      invalidate("pos-init");
      await loadOrders();
      await refreshSelectedOrder();
    } catch (error) {
      console.error("Error saving customer name:", error);
      showMsg("error", "Gagal menyimpan nama pelanggan");
    }
  };
```

Note: confirm the Riwayat Penjualan cache key in Task 10 Step 0; if it differs from `"sales-history"`, update this `invalidate(...)` call to match.

- [ ] **Step 6: Pass onEditCustomer to modal + render editor**

In the `<SpkDetailModal ... />` usage (line 646-657), add the prop:

```jsx
          onUpdateOrderStatus={handleUpdateStatus}
          onEditCustomer={handleOpenCustomerEditor}
          onPrint={handlePrintSPK}
```

Then add a small editor modal right after the `<SpkDetailModal />` block (before the closing `)}` at line 658). It supports free text + pick from a datalist:

```jsx
      {showCustomerEditor && selectedOrder && (
        <div
          className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCustomerEditor(false);
          }}
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-3">
              Ubah Nama Pelanggan
            </h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">
              Ketik nama bebas, atau pilih pelanggan terdaftar dari daftar.
            </p>
            <input
              list="spk-pelanggan-list"
              value={customerNameInput}
              onChange={(e) => setCustomerNameInput(e.target.value)}
              placeholder="Nama pelanggan"
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-100 mb-4"
              autoFocus
            />
            <datalist id="spk-pelanggan-list">
              {customerOptions.map((c) => (
                <option key={c.id} value={c.nama} />
              ))}
            </datalist>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCustomerEditor(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const nama = customerNameInput.trim();
                  const match = customerOptions.find((c) => c.nama === nama);
                  if (match) {
                    handleSaveCustomerName({ pelanggan_id: match.id });
                  } else {
                    handleSaveCustomerName({ pelanggan_nama_snapshot: nama });
                  }
                }}
                disabled={!customerNameInput.trim()}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold disabled:opacity-50"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 7: Type-check + commit**

Run: `npm run type-check`
Expected: 0 error.

```bash
git add src/app/produksi/spk/page.tsx src/app/produksi/spk/actions.ts
git commit -m "feat(produksi): cascade SELESAI di UI + editor nama pelanggan + invalidasi cache"
```

<!-- M:T9 -->
Also update the note in Step 5 of Task 9: the Riwayat Penjualan cache key is `"pos-init"` (sales are part of `POSInitData`), so the `invalidate("pos-init")` call is correct as written.

### Task 10: Kasir — prompt cetak menyimpan nama + verifikasi penuh

**Files:**
- Modify: `src/components/TabelRiwayatPenjualan.tsx`

The faktur prompt currently passes name/kota print-only. Make it persist via `updateSaleCustomerAction`.

- [ ] **Step 1: Import action**

In `src/components/TabelRiwayatPenjualan.tsx`, add an import (place with the other imports near top):

```typescript
import { updateSaleCustomerAction } from "@/app/produksi/spk/actions";
```

(Note: server actions can be imported across route folders; this is a `"use server"` module.)

- [ ] **Step 2: Persist on prompt submit**

Find `submitFakturPrompt` (line ~80-91) — it is a `useCallback` and branches on `fakturPromptMode === "preview"`. Make it `async`, persist the typed name first, then proceed. Replace the whole `useCallback`:

```typescript
  const submitFakturPrompt = useCallback(async () => {
    const sale = fakturPromptSale;
    const nama = fakturPromptInput.nama.trim();
    const kota = fakturPromptInput.kota.trim() || "Bekasi";
    if (!sale || !nama) return;
    // Simpan nama ke transaksi supaya sinkron dengan SPK (operator) — bukan
    // lagi print-only. Nama bebas -> snapshot.
    try {
      await updateSaleCustomerAction(sale.id, {
        pelanggan_nama_snapshot: nama,
      });
    } catch (e) {
      console.error("Gagal menyimpan nama pelanggan:", e);
    }
    setFakturPromptSale(null);
    if (fakturPromptMode === "preview") {
      previewFaktur(sale, nama, kota);
    } else {
      reprintFaktur(sale, nama, kota);
    }
  }, [fakturPromptSale, fakturPromptInput, fakturPromptMode]);
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 4: Jalankan seluruh test terkait**

Run: `npx jest status-produksi production-customer-name --silent`
Expected: PASS semua.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: sukses (exit 0).

- [ ] **Step 6: Commit**

```bash
git add src/components/TabelRiwayatPenjualan.tsx
git commit -m "feat(pos): prompt cetak faktur menyimpan nama pelanggan (sinkron dgn SPK)"
```

- [ ] **Step 7: Uji manual (browser, localhost)**

Verifikasi alur end-to-end:
1. Buat penjualan → buka `/produksi/spk` → buka detail SPK.
2. Ubah satu item ke PRINTING → tutup & buka lagi: status order otomatis jadi PROSES.
3. Item maklon: dropdown menampilkan opsi Pesan Kurir/Tunggu Kurir/Sedang Dikirim/Dikerjakan Vendor/Sedang Diambil/Siap Diambil (label tanpa underscore).
4. Set order = SELESAI manual: bila ada item roll PENDING → muncul pesan item terhalang & order tidak jadi SELESAI; bila tidak ada → semua item SELESAI & order SELESAI.
5. Override: set order PROSES manual saat semua item MENUNGGU → order tetap PROSES; lalu gerakkan item hingga derivasi = PROSES → override reset otomatis (ubah item ke MENUNGGU lagi → order kembali ikut otomatis ke MENUNGGU).
6. Klik nama pelanggan di SPK → ketik "Pak Budi" → simpan. Buka `/pos` Riwayat Penjualan transaksi sama → cetak faktur: nama sudah "Pak Budi" (tidak ditanya lagi).
7. Sebaliknya: transaksi tanpa nama → cetak di Riwayat Penjualan → isi nama di prompt → buka SPK terkait: nama ikut terisi.

## Self-Review

**Spec coverage:**
- Status item per jenis (cetak vs maklon) → Task 1 (konstanta) + Task 8 (UI dropdown per jenis). ✓
- Label ramah manusia tanpa underscore → Task 1 (`labelStatus`) + Task 8. ✓
- Order auto-derive dari item → Task 4 (`recomputeOrderStatusFromItems`). ✓
- Override reset-otomatis → Task 4 Step 3. ✓
- Cascade SELESAI dengan konfirmasi + item terhalang dilaporkan → Task 4 Step 6 + Task 9 Step 3. ✓
- DIBATALKAN tidak cascade → tidak ada cascade selain SELESAI (Task 9 Step 3 hanya menangani SELESAI). ✓
- Nama pintar (snapshot vs pelanggan_id) → Task 4 Step 7 + Task 9 Step 6 (pencocokan match → pelanggan_id, else snapshot). ✓
- Sinkron dua arah (kasir menyimpan) → Task 10. ✓
- Tanpa quick-add pelanggan di SPK → Task 9 editor hanya ketik bebas / pilih datalist. ✓
- Konstanta terpusat + Zod, lepas CHECK → Task 1, 2, 3. ✓
- Auth guard pada action → Task 5. ✓
- Verifikasi (type-check, build, jest, manual) → Task 10. ✓

**Placeholder scan:** Tidak ada TBD/TODO. Semua step berisi kode konkret.

**Type consistency:**
- `deriveOrderStatus(statuses: string[])` dipakai konsisten di Task 1 & Task 4.
- `setOrderStatusSelesaiCascade` mengembalikan `{ selesai, terhalang, statusOrderAkhir }` (Task 4) — dipakai di Task 9 (`hasil.terhalang`). ✓
- `updateSaleCustomer(penjualanId, { pelanggan_id?, pelanggan_nama_snapshot? })` konsisten Task 4 → 5 → 9 → 10. ✓
- `daftarStatusUntukItem({ is_maklon })` — `is_maklon` ditambahkan ke `ProductionItem` (Task 4 Step 1) dan di-surface (Task 4 Step 2), dipakai di Task 8. ✓
- Cache key Riwayat Penjualan = `"pos-init"` (terverifikasi), dipakai di Task 9 Step 5. ✓
- `submitFakturPrompt` tetap `useCallback` async dengan deps yang sama (Task 10 Step 2, sudah dikoreksi agar cocok kode nyata). ✓

Catatan risiko: rebuild `item_produksi` di SQLite (Task 3 Step 3) menyalin DDL dengan regex; bila DDL nyata berbeda format, INSERT kolom tetap aman karena memakai daftar kolom dari `PRAGMA table_info`. Diuji lewat `npm run build` + uji manual desktop bila ada.

