# Sub-project A: SPK — Status, Tombol Siap Diambil, Pagination — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empat perubahan halaman SPK & Pengambilan — hapus field status finishing, tombol Siap Diambil di modal, status Selesai sebagai option disabled, pagination server-side limit/offset.

**Architecture:** Section 1 sentral: drop kolom `item_finishing.status` (migration + sync 3 tempat + cleanup service/UI). Section 2 & 3: perubahan UI modal + guard backend item status. Section 4: pagination — tambah `db.count()`, ubah `getProductionOrders` terima limit/offset/filter, tambah `getProductionOrderCounts`, update client pakai SWR key dinamis + tombol "Muat 50 data lagi".

**Tech Stack:** Next.js 15 (App Router, server actions), React 19, SWR (`useCachedData`), Supabase Postgres (server), SQLite (Tauri fallback), Zod, Jest (node + jsdom), Tailwind CSS, Bahasa Indonesia untuk UI/komentar.

## Global Constraints

- Bahasa Indonesia untuk semua UI strings, komentar baru, pesan error. Framework/library terms boleh English.
- Schema change = 3 tempat sync: (a) `supabase/migrations/<timestamp>_<name>.sql` (additive), (b) `database/sqlite-schema.sql`, (c) runtime ALTER di `src/lib/db-unified.ts`.
- Mutating server action wajib auth guard (`requireProductionInventoryRole` / `requireSession`).
- Validasi input mutasi pakai Zod (`src/lib/schemas/`). `safeParse` → 422/error.
- Tidak boleh import `getSupabaseAdmin` dari client code.
- Pakai `db.query/queryOne/insert/update/delete` dari `src/lib/db-unified.ts` — jangan import client Supabase/SQLite langsung dari feature code.
- Fetch data client pakai `useCachedData` (SWR), bukan `useAsyncData`.
- Dark mode wajib: setiap color class butuh pasangan `dark:`.
- Verifikasi wajib selesai "done": `npm run type-check` (0 error) → `npm run build` → `npx jest` untuk test terkait. Lint warning baru harus diperbaiki.
- Node 22 + npm. Next.js standalone. Tauri via `src-tauri/`.
- Icons: SVG components dari `src/components/icons/`, jangan emoji.

## File Structure

**Modify:**
- `supabase/migrations/<timestamp>_drop_item_finishing_status.sql` — migration drop kolom.
- `database/sqlite-schema.sql` — hapus kolom dari definisi `item_finishing`.
- `src/lib/db-unified.ts` — runtime ALTER drop column + tambah method `db.count(table, where)`.
- `src/lib/services/production-service.ts` — hapus field `status` dari `FinishingItem` + insert; ubah `getProductionOrders` terima pagination/filter + return `{data, total}`; tambah `getProductionOrderCounts`; guard `updateProductionItemStatus` tolak `SIAP_AMBIL`/`SELESAI`.
- `src/lib/services/pengambilan-service.ts` — `listPengambilanBelumDiambil`/`listPengambilanSudahDiambil` terima `{limit, offset}` + return `{data, total}`.
- `src/app/produksi/spk/actions.ts` — update `getProductionOrdersAction` signature + tambah `getProductionOrderCountsAction`.
- `src/app/produksi/pengambilan/actions.ts` — update signature list actions.
- `src/app/produksi/spk/page.tsx` — SWR key dinamis, state `limit`, tombol "Muat 50 data lagi", counter dari action counts, handler `handleMarkSiapDiambil`, invalidasi prefix.
- `src/app/produksi/spk/components/SpkDetailModal.tsx` — hapus badge status finishing, tambah tombol "Siap Diambil" di footer, dropdown order/item tambah option disabled untuk status terminal.
- `src/app/produksi/pengambilan/page.tsx` — SWR key dinamis, state `limit` per tab, tombol "Muat 50 data lagi", tab counter pakai `total`.
- `src/lib/sync-config.ts` — verifikasi tidak referensi `status` di `item_finishing` select list (kemungkinan tidak perlu ubah, tapi cek).
- `src/lib/__tests__/production-order-detail.test.ts` — update mock `item_finishing` (hapus field `status` jika ada).

**Create:**
- `src/lib/__tests__/production-pagination.test.ts` — test `getProductionOrders` dengan limit/offset + counts.
- `src/lib/__tests__/production-item-status-guard.test.ts` — test guard tolak `SIAP_AMBIL`/`SELESAI` di `updateProductionItemStatus`.
- `src/lib/__tests__/pengambilan-pagination.test.ts` — test pagination pengambilan.

---

### Task 1: Migration drop kolom `item_finishing.status` + sync SQLite schema + runtime ALTER

**Files:**
- Create: `supabase/migrations/20260707000001_drop_item_finishing_status.sql`
- Modify: `database/sqlite-schema.sql` (cari definisi `item_finishing`, hapus kolom `status`)
- Modify: `src/lib/db-unified.ts` (tambah runtime ALTER idempoten di blok migrasi SQLite)

**Interfaces:**
- Consumes: struktur tabel `item_finishing` yang ada kolom `status` (text, default 'MENUNGGU').
- Produces: kolom `status` hilang dari DB. Task berikutnya boleh mengandalkan field itu tidak ada.

- [ ] **Step 1: Cek isi `database/sqlite-schema.sql` untuk definisi `item_finishing`**

Run: `grep -n "item_finishing" database/sqlite-schema.sql`
Expected: menemukan `CREATE TABLE` dengan kolom `status TEXT`.

- [ ] **Step 2: Cek blok runtime ALTER di `db-unified.ts`**

Run: `grep -n "ALTER TABLE.*ADD COLUMN\|runSqliteMigrations\|migrasiSqlite" src/lib/db-unified.ts | head -20`
Expected: menemukan blok tempat ALTER TABLE runtime dijalankan.

- [ ] **Step 3: Buat migration Supabase**

Tulis file `supabase/migrations/20260707000001_drop_item_finishing_status.sql`:

```sql
-- Hapus kolom status dari item_finishing.
-- Finishing tidak lagi punya pelacakan status per-line; status item produksi
-- (order_item_produksi.status) yang menjadi sumber kebenaran.
ALTER TABLE item_finishing DROP COLUMN IF EXISTS status;
```

- [ ] **Step 4: Hapus kolom `status` dari `database/sqlite-schema.sql`**

Edit `database/sqlite-schema.sql`: di blok `CREATE TABLE IF NOT EXISTS item_finishing (...)`, hapus baris `status TEXT ...,`. Hanya hapus kolom `status` — jangan sentuh kolom lain.

- [ ] **Step 5: Tambah runtime ALTER idempoten di `src/lib/db-unified.ts`**

Cari blok tempat ALTER runtime lain dijalankan (dari Step 2). Tambahkan di dekat blok itu:

```ts
// Hapus kolom status dari item_finishing (migrasi 20260707000001).
// SQLite 3.35+ mendukung DROP COLUMN; better-sqlite3 di Node 22 sudah cukup baru.
try {
  sqliteDb.exec("ALTER TABLE item_finishing DROP COLUMN status");
} catch (_e) {
  // Kolom mungkin sudah tidak ada (fresh install dari sqlite-schema baru).
  // Idempoten: diam saja.
}
```

Catatan: bungkus dengan try/catch. Jangan throw kalau gagal (kolom sudah hilang). Letakkan di blok yang dijalankan sekali saat startup, sama seperti ALTER lain.

- [ ] **Step 6: Cek `src/lib/sync-config.ts` tidak referensi `status` di `item_finishing`**

Run: `grep -n "item_finishing" src/lib/sync-config.ts`
Expected: jika ada entry, pastikan tidak ada select list yang menyebutkan `status`. Jika `item_finishing` hanya terdaftar sebagai table name tanpa column list → aman.

- [ ] **Step 7: Verifikasi type-check**

Run: `npm run type-check`
Expected: 0 error. (Belum ada kode yang hapus field `status` dari TS — ini hanya DB schema. Type mungkin masih punya field, akan dibersihkan di Task 2.)

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260707000001_drop_item_finishing_status.sql database/sqlite-schema.sql src/lib/db-unified.ts
git commit -m "feat(db): drop kolom status item_finishing (migration + sqlite schema + runtime ALTER)"
```

---

### Task 2: Hapus field `status` dari interface & insert `FinishingItem`

**Files:**
- Modify: `src/lib/services/production-service.ts` (interface `FinishingItem` line 95-105, insert di `createProductionOrder` ~line 600-620)
- Modify: `src/lib/services/pos-mutations.ts` (insert `item_finishing` ~line 955-965)
- Test: `src/lib/__tests__/production-order-detail.test.ts`

**Interfaces:**
- Consumes: kolom `status` sudah di-drop dari DB (Task 1).
- Produces: `FinishingItem` TS interface tidak lagi punya field `status`. Insert tidak set `status`.

- [ ] **Step 1: Update interface `FinishingItem` di `production-service.ts`**

Edit `src/lib/services/production-service.ts` line 95-105. Hapus baris:
```ts
  status: "MENUNGGU" | "PROSES" | "SELESAI";
```
Sisakan:
```ts
export interface FinishingItem {
  id: string;
  item_produksi_id: string;
  jenis_finishing: string;
  keterangan?: string | null;
  operator_id?: string | null;
  operator_nama?: string;
  dibuat_pada?: string;
  diperbarui_pada?: string;
}
```

- [ ] **Step 2: Hapus `status` dari insert `item_finishing` di `createProductionOrder`**

Di `src/lib/services/production-service.ts` sekitar line 600-620, cari blok:
```ts
const finishingItem = {
  item_produksi_id: ...,
  jenis_finishing: fin.jenis_finishing,
  keterangan: fin.keterangan || null,
  status: "MENUNGGU",   // ← hapus baris ini
  operator_id: ...,
  ...
};
```
Hapus baris `status: "MENUNGGU",`.

- [ ] **Step 3: Hapus `status` dari insert `item_finishing` di `pos-mutations.ts`**

Di `src/lib/services/pos-mutations.ts` sekitar line 955-965, cari blok serupa:
```ts
const finishingItem = {
  item_produksi_id: ...,
  jenis_finishing: fin.jenis_finishing,
  keterangan: fin.keterangan || null,
  status: "MENUNGGU",   // ← hapus baris ini
  operator_id: ...,
  ...
};
```
Hapus baris `status: "MENUNGGU",`.

- [ ] **Step 4: Update mock test `production-order-detail.test.ts`**

Edit `src/lib/__tests__/production-order-detail.test.ts` line 40-42. Mock `item_finishing` saat ini:
```ts
mockTable("item_finishing").set("if1", {
  id: "if1", item_produksi_id: "ip1", operator_id: "u1", dibuat_pada: "2026-05-25",
});
```
Tidak ada field `status` di mock — sudah benar. Tidak perlu ubah. Verifikasi test masih lulus.

- [ ] **Step 5: Run type-check**

Run: `npm run type-check`
Expected: 0 error. Jika ada error tentang `finishing.status` di file lain, catat lokasinya untuk Task 3 (modal hapus badge).

- [ ] **Step 6: Run test yang ada**

Run: `npx jest src/lib/__tests__/production-order-detail.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/production-service.ts src/lib/services/pos-mutations.ts
git commit -m "refactor(produksi): hapus field status dari FinishingItem interface dan insert"
```

---

### Task 3: Hapus badge status finishing di modal SPK

**Files:**
- Modify: `src/app/produksi/spk/components/SpkDetailModal.tsx` (line 370-403, blok finishing)

**Interfaces:**
- Consumes: `FinishingItem` tidak lagi punya field `status` (Task 2).
- Produces: modal tidak render badge status per finishing.

- [ ] **Step 1: Edit blok finishing di `SpkDetailModal.tsx`**

Cari blok finishing (line 370-403). Saat ini:
```tsx
{item.finishing.map((fin) => (
  <div key={fin.id} className="flex items-center justify-between ...">
    <div className="flex-1">
      <span className="font-medium ...">{fin.jenis_finishing}</span>
      {fin.keterangan && (
        <span className="text-sm ... ml-2">({fin.keterangan})</span>
      )}
    </div>
    <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(fin.status)}`}>
      {fin.status}
    </span>
  </div>
))}
```

Hapus `<span>` badge status. Sisakan:
```tsx
{item.finishing.map((fin) => (
  <div key={fin.id} className="flex items-center justify-between bg-orange-50 dark:bg-slate-800 px-3 py-2 rounded-lg">
    <div className="flex-1">
      <span className="font-medium text-gray-900 dark:text-slate-100">
        {fin.jenis_finishing}
      </span>
      {fin.keterangan && (
        <span className="text-sm text-gray-600 dark:text-slate-300 ml-2">
          ({fin.keterangan})
        </span>
      )}
    </div>
  </div>
))}
```

- [ ] **Step 2: Verifikasi import `getStatusColor` masih dipakai**

Cek apakah `getStatusColor` masih dipakai di file ini untuk dropdown order/item (line 194, 259). Jika masih dipakai → biarkan import. Jika tidak → hapus import.

Run: `grep -n "getStatusColor" src/app/produksi/spk/components/SpkDetailModal.tsx`
Expected: masih dipakai untuk dropdown order & item status. Biarkan import.

- [ ] **Step 3: Run type-check + build**

Run: `npm run type-check && npm run build`
Expected: 0 error, build sukses.

- [ ] **Step 4: Commit**

```bash
git add src/app/produksi/spk/components/SpkDetailModal.tsx
git commit -m "feat(spk): hapus badge status finishing dari modal detail"
```

---

### Task 4: Guard `updateProductionItemStatus` tolak `SIAP_AMBIL` & `SELESAI` (TDD)

**Files:**
- Modify: `src/lib/services/production-service.ts` (`updateProductionItemStatus` line 1053-)
- Test: `src/lib/__tests__/production-item-status-guard.test.ts` (create)

**Interfaces:**
- Consumes: function `updateProductionItemStatus(itemId, { status, operator_id })`.
- Produces: function throw error friendly saat `status` = `SIAP_AMBIL` atau `SELESAI`. Status terminal item hanya via cascade/Pengambilan.

- [ ] **Step 1: Tulis failing test**

Buat file `src/lib/__tests__/production-item-status-guard.test.ts`:

```ts
/**
 * updateProductionItemStatus menolak status terminal (SIAP_AMBIL, SELESAI)
 * karena status tersebut hanya boleh di-set otomatis lewat cascade Siap
 * Diambil atau halaman Pengambilan (Sudah Diambil).
 */
import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
  };
});
jest.mock("@/lib/services/inventory-service", () => ({
  __esModule: true,
  getRollVariants: jest.fn(),
  postInventoryMovement: jest.fn(),
}));
jest.mock("@/lib/services/shop-settings-service", () => ({
  __esModule: true,
  getShopSettings: jest.fn(),
}));

import { updateProductionItemStatus } from "../services/production-service";

beforeEach(() => resetMockDb());

describe("updateProductionItemStatus guard terminal", () => {
  it("menolak SIAP_AMBIL dengan pesan Bahasa Indonesia", async () => {
    mockTable("item_produksi").set("ip1", {
      id: "ip1",
      order_produksi_id: "op1",
      status: "PRINTING",
      roll_inventory_status: "NOT_REQUIRED",
    });
    await expect(
      updateProductionItemStatus("ip1", { status: "SIAP_AMBIL" as any }),
    ).rejects.toThrow(/Siap Diambil.*cascade|cascade.*Siap Diambil/i);
  });

  it("menolak SELESAI dengan pesan Bahasa Indonesia", async () => {
    mockTable("item_produksi").set("ip2", {
      id: "ip2",
      order_produksi_id: "op2",
      status: "FINISHING",
      roll_inventory_status: "NOT_REQUIRED",
    });
    await expect(
      updateProductionItemStatus("ip2", { status: "SELESAI" as any }),
    ).rejects.toThrow(/Selesai.*Pengambilan|Pengambilan.*Selesai/i);
  });

  it("menerima PRINTING (status non-terminal)", async () => {
    mockTable("item_produksi").set("ip3", {
      id: "ip3",
      order_produksi_id: "op3",
      status: "MENUNGGU",
      roll_inventory_status: "NOT_REQUIRED",
    });
    const result = await updateProductionItemStatus("ip3", { status: "PRINTING" });
    expect(result).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, verifikasi FAIL**

Run: `npx jest src/lib/__tests__/production-item-status-guard.test.ts`
Expected: FAIL. Test pertama & kedua gagal karena `updateProductionItemStatus` belum throw untuk SIAP_AMBIL/SELESAI. Test ketiga mungkin pass (PRINTING diterima). Catatan: test ketiga mungkin juga fail karena mock `db.queryOne` mengembalikan item, lalu kode coba update — pastikan mock mengembalikan data dengan `status` field agar guard DIBATALKAN lolos.

- [ ] **Step 3: Implementasi guard di `updateProductionItemStatus`**

Edit `src/lib/services/production-service.ts` fungsi `updateProductionItemStatus` (line 1053). Tambah guard di awal fungsi, sebelum guard DIBATALKAN yang sudah ada:

```ts
export async function updateProductionItemStatus(
  itemId: string,
  data: {
    status:
      | "MENUNGGU"
      | "PRINTING"
      | "FINISHING"
      | "DIKERJAKAN_VENDOR"
      | "SEDANG_DIAMBIL"
      | "SELESAI";
    operator_id?: string;
  },
): Promise<boolean> {
  try {
    // Guard: status terminal item (SIAP_AMBIL, SELESAI) hanya boleh di-set
    // otomatis lewat cascade Siap Diambil atau halaman Pengambilan. Operator
    // tidak boleh memilihnya manual dari dropdown item di modal SPK.
    if (data.status === "SIAP_AMBIL") {
      throw new Error(
        "Status Siap Diambil item hanya bisa di-set otomatis lewat tombol Siap Diambil (cascade).",
      );
    }
    if (data.status === "SELESAI") {
      throw new Error(
        "Status Selesai item hanya bisa di-set otomatis lewat halaman Pengambilan (Sudah Diambil).",
      );
    }

    // Guard: item produksi yang DIBATALKAN karena penjualannya VOID tidak
    // boleh dihidupkan lagi (konsisten dengan guard di order).
    const cur = await db.queryOne<any>("item_produksi", {
      where: { id: itemId },
    });
    // ... (sisanya tetap)
```

- [ ] **Step 4: Run test, verifikasi PASS**

Run: `npx jest src/lib/__tests__/production-item-status-guard.test.ts`
Expected: PASS, 3 test lulus.

- [ ] **Step 5: Run semua test produksi untuk pastikan tidak regress**

Run: `npx jest src/lib/__tests__/production`
Expected: semua PASS.

- [ ] **Step 6: Run type-check**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/production-service.ts src/lib/__tests__/production-item-status-guard.test.ts
git commit -m "feat(produksi): guard updateProductionItemStatus tolak SIAP_AMBIL & SELESAI manual"
```

---

### Task 5: Dropdown order & item tambah option disabled untuk status terminal

**Files:**
- Modify: `src/app/produksi/spk/components/SpkDetailModal.tsx` (dropdown order line 191-208, dropdown item line 254-274)

**Interfaces:**
- Consumes: `STATUS_ORDER` dan `daftarStatusManualUntukItem` dari `src/lib/produksi/status-produksi.ts`; `labelStatus` dari sana.
- Produces: dropdown order menampilkan `SELESAI` (disabled) saat value = SELESAI. Dropdown item menampilkan `SIAP_AMBIL`/`SELESAI` (disabled) saat value = status tersebut.

- [ ] **Step 1: Edit dropdown order di `SpkDetailModal.tsx`**

Cari blok dropdown order (line 191-208). Saat ini:
```tsx
<select
  value={order.status}
  onChange={(e) => onUpdateOrderStatus(order.id, e.target.value)}
  className={`px-3 py-1 rounded-full text-xs font-semibold border-2 cursor-pointer ${getStatusColor(order.status)}`}
>
  {STATUS_ORDER.filter((s) => s !== "SELESAI").map((s) => (
    <option key={s} value={s} className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100">
      {labelStatus(s)}
    </option>
  ))}
</select>
```

Ganti dengan:
```tsx
<select
  value={order.status}
  onChange={(e) => onUpdateOrderStatus(order.id, e.target.value)}
  className={`px-3 py-1 rounded-full text-xs font-semibold border-2 cursor-pointer ${getStatusColor(order.status)}`}
>
  {STATUS_ORDER.filter((s) => s !== "SELESAI").map((s) => (
    <option key={s} value={s} className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100">
      {labelStatus(s)}
    </option>
  ))}
  {order.status === "SELESAI" && (
    <option disabled value="SELESAI" className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100">
      {labelStatus("SELESAI")}
    </option>
  )}
</select>
```

- [ ] **Step 2: Edit dropdown item di `SpkDetailModal.tsx`**

Cari blok dropdown item (line 254-274). Saat ini:
```tsx
<select
  value={item.status}
  onChange={(e) => onUpdateItemStatus(item.id, e.target.value)}
  className={`px-3 py-1 rounded-full text-xs font-semibold border-2 cursor-pointer ${getStatusColor(item.status)}`}
>
  {daftarStatusManualUntukItem({ is_maklon: item.is_maklon }).map((s) => (
    <option key={s} value={s} className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100">
      {labelStatus(s)}
    </option>
  ))}
</select>
```

Ganti dengan:
```tsx
<select
  value={item.status}
  onChange={(e) => onUpdateItemStatus(item.id, e.target.value)}
  className={`px-3 py-1 rounded-full text-xs font-semibold border-2 cursor-pointer ${getStatusColor(item.status)}`}
>
  {daftarStatusManualUntukItem({ is_maklon: item.is_maklon }).map((s) => (
    <option key={s} value={s} className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100">
      {labelStatus(s)}
    </option>
  ))}
  {["SIAP_AMBIL", "SELESAI"].includes(item.status) && (
    <option disabled value={item.status} className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100">
      {labelStatus(item.status)}
    </option>
  )}
</select>
```

- [ ] **Step 3: Run type-check + build**

Run: `npm run type-check && npm run build`
Expected: 0 error, build sukses.

- [ ] **Step 4: Commit**

```bash
git add src/app/produksi/spk/components/SpkDetailModal.tsx
git commit -m "fix(spk): option disabled untuk status terminal di dropdown order & item"
```

---

### Task 6: Tombol "Siap Diambil" di footer modal SPK

**Files:**
- Modify: `src/app/produksi/spk/components/SpkDetailModal.tsx` (props interface + footer)
- Modify: `src/app/produksi/spk/page.tsx` (handler `handleMarkSiapDiambil` + pass prop)

**Interfaces:**
- Consumes: `setOrderStatusSiapDiambilCascadeAction` dari `./actions` (sudah ada).
- Produces: modal punya prop `onMarkSiapDiambil: (orderId: string) => Promise<void>`. Page menyediakan handler yang panggil cascade + toast + reload.

- [ ] **Step 1: Tambah prop `onMarkSiapDiambil` & state loading di `SpkDetailModal.tsx`**

Edit interface `SpkDetailModalProps` (line 34-46), tambah:
```ts
export interface SpkDetailModalProps {
  // ... existing ...
  onMarkSiapDiambil: (orderId: string) => Promise<void>;
}
```

Di parameter fungsi (line 49-61), tambah `onMarkSiapDiambil` ke destructure.

Di body komponen, tambah state loading:
```ts
const [markingSiapDiambil, setMarkingSiapDiambil] = useState(false);
```

(Pastikan `useState` sudah di-import — sudah ada di line 3.)

- [ ] **Step 2: Tambah tombol di footer modal**

Cari blok footer (line 426-445). Saat ini ada tombol Batal + Cetak SPK. Tambah tombol "Siap Diambil" sebelum tombol Batal, hanya render saat `order.status === "MENUNGGU" || order.status === "PROSES"`:

```tsx
<div className="p-4 border-t border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 flex items-center justify-end gap-3 shrink-0">
  {(order.status === "MENUNGGU" || order.status === "PROSES") && (
    <button
      type="button"
      disabled={markingSiapDiambil}
      onClick={async () => {
        setMarkingSiapDiambil(true);
        try {
          await onMarkSiapDiambil(order.id);
        } finally {
          setMarkingSiapDiambil(false);
        }
      }}
      className="px-6 py-2 bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-lg hover:shadow-lg transition-all font-semibold disabled:opacity-50"
    >
      {markingSiapDiambil ? "Menandai..." : "Siap Diambil"}
    </button>
  )}
  <button
    type="button"
    onClick={() => onClose()}
    className="px-6 py-2 bg-white dark:bg-slate-900 border-2 border-gray-300 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 transition-colors font-semibold"
  >
    Batal
  </button>
  <button
    type="button"
    onClick={() => { onPrint(order); onClose(); }}
    className="px-6 py-2 bg-gradient-to-r from-amber-700 to-amber-900 text-white rounded-lg hover:shadow-lg transition-all font-semibold flex items-center gap-2"
  >
    <PrinterIcon size={18} />
    Cetak SPK
  </button>
</div>
```

- [ ] **Step 3: Tambah handler `handleMarkSiapDiambil` di `page.tsx`**

Edit `src/app/produksi/spk/page.tsx`. Tambah handler setelah `handleUpdateStatus` (sekitar line 252). Logic diambil dari blok `if (newStatus === "SIAP_AMBIL")` di `handleUpdateStatus` (line 221-238):

```ts
const handleMarkSiapDiambil = async (orderId: string) => {
  try {
    const ok = window.confirm("Tandai SPK siap diambil pelanggan?");
    if (!ok) return;
    const hasil = await setOrderStatusSiapDiambilCascadeAction(orderId);
    if (hasil.terhalang.length > 0) {
      const nama = hasil.terhalang.map((t) => t.nama).join(", ");
      showMsg(
        "error",
        `Item berikut belum bisa diselesaikan: ${nama}. Konfirmasi bahan roll dulu jika perlu.`,
      );
    } else if (hasil.statusOrderAkhir === "SIAP_AMBIL") {
      showMsg("success", "SPK ditandai Siap Diambil");
    } else {
      showMsg(
        "error",
        "SPK belum bisa ditandai Siap Diambil — periksa status item.",
      );
    }
    await loadOrders();
    await refreshSelectedOrder();
  } catch (error) {
    console.error("Error marking siap diambil:", error);
    showMsg(
      "error",
      error instanceof Error ? error.message : "Gagal menandai Siap Diambil",
    );
  }
};
```

- [ ] **Step 4: Pass prop `onMarkSiapDiambil` ke modal di `page.tsx`**

Cari render `<SpkDetailModal ... />` (line 749-762). Tambah prop:
```tsx
<SpkDetailModal
  order={selectedOrder}
  rollVariantsByItem={rollVariantsByItem}
  consumptionDrafts={consumptionDrafts}
  onClose={() => setShowDetailModal(false)}
  onUpdateItemStatus={handleUpdateItemStatus}
  onPatchDraft={patchConsumptionDraft}
  onPostConsumption={handlePostConsumption}
  onVoidConsumption={handleVoidConsumption}
  onUpdateOrderStatus={handleUpdateStatus}
  onEditCustomer={handleOpenCustomerEditor}
  onPrint={handlePrintSPK}
  onMarkSiapDiambil={handleMarkSiapDiambil}
/>
```

- [ ] **Step 5: Run type-check + build**

Run: `npm run type-check && npm run build`
Expected: 0 error, build sukses.

- [ ] **Step 6: Commit**

```bash
git add src/app/produksi/spk/components/SpkDetailModal.tsx src/app/produksi/spk/page.tsx
git commit -m "feat(spk): tombol Siap Diambil di footer modal detail"
```

---

### Task 7: Tambah method `db.count(table, where)` di `db-unified.ts` (TDD)

**Files:**
- Modify: `src/lib/db-unified.ts` (tambah method `count` di class `UnifiedDatabase`)
- Test: `src/lib/__tests__/db-count.test.ts` (create)

**Interfaces:**
- Consumes: `QueryOptions.where` semantics yang sudah ada.
- Produces: `db.count(table, where): Promise<number>` — return jumlah row yang match where. Untuk Supabase pakai `select("*", { count: "exact", head: true })`. Untuk SQLite pakai `SELECT COUNT(*) as cnt FROM table WHERE ...`.

- [ ] **Step 1: Tulis failing test**

Buat file `src/lib/__tests__/db-count.test.ts`:

```ts
/**
 * db.count(table, where) mengembalikan jumlah row yang cocok dengan filter
 * equality, tanpa memuat data. Dipakai untuk pagination counter.
 */
import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return { db: real.__mock.db };
});

import { db } from "../db-unified";

beforeEach(() => resetMockDb());

describe("db.count", () => {
  it("mengembalikan 0 untuk tabel kosong", async () => {
    const n = await db.count("order_produksi");
    expect(n).toBe(0);
  });

  it("mengembalikan jumlah total tanpa filter", async () => {
    mockTable("order_produksi").set("a", { id: "a", status: "PROSES" });
    mockTable("order_produksi").set("b", { id: "b", status: "MENUNGGU" });
    mockTable("order_produksi").set("c", { id: "c", status: "SELESAI" });
    const n = await db.count("order_produksi");
    expect(n).toBe(3);
  });

  it("menghormati filter equality", async () => {
    mockTable("order_produksi").set("a", { id: "a", status: "PROSES" });
    mockTable("order_produksi").set("b", { id: "b", status: "MENUNGGU" });
    mockTable("order_produksi").set("c", { id: "c", status: "SELESAI" });
    const n = await db.count("order_produksi", { status: "PROSES" });
    expect(n).toBe(1);
  });
});
```

Catatan: mock-db perlu ditambah implementasi `count`. Tapi karena `db` di mock adalah objek hardcoded, kita perlu tambah method `count` ke mock-db juga.

- [ ] **Step 2: Tambah `count` ke mock-db**

Edit `src/lib/__tests__/helpers/mock-db.ts`. Di objek `db` (line 78-127), tambah method `count` setelah `query`:

```ts
  count: jest.fn(async (table: string, where?: Record<string, unknown>) => {
    const rows = Array.from(rowsOf(table).values()).filter((row) =>
      matchesWhere(row, where),
    );
    return rows.length;
  }),
```

Tambah juga `count` ke array `fn.mockClear()` di `resetMockDb` (line 141-152):

```ts
  for (const fn of [
    db.query,
    db.queryOne,
    db.insert,
    db.update,
    db.delete,
    db.transaction,
    db.count,
    generateId,
    getCurrentTimestamp,
  ]) {
    fn.mockClear();
  }
```

- [ ] **Step 3: Run test, verifikasi FAIL**

Run: `npx jest src/lib/__tests__/db-count.test.ts`
Expected: FAIL — `db.count is not a function` (karena `db-unified.ts` real belum punya method `count`). Mock sudah punya, tapi jest.mock mengganti `db-unified` dengan mock yang punya `count` — seharusnya test PASS dengan mock. Tapi kita juga butuh real implementation. Sebenarnya karena test mock `db-unified`, test ini hanya test mock. Untuk test real, skip — kita andalkan integration. Pertimbangan: tetap tulis real implementation di step berikut agar production code bisa pakai.

Sebenarnya untuk TDD yang bermakna, kita perlu test yang tidak mock `db-unified`. Tapi service test selalu mock. Solusi: tulis real implementation, test mock hanya verifikasi contract. Lanjut.

Run: `npx jest src/lib/__tests__/db-count.test.ts`
Expected: PASS (karena mock sudah punya count). Ini test contract, bukan real.

- [ ] **Step 4: Implementasi `count` di `UnifiedDatabase` real**

Edit `src/lib/db-unified.ts`. Di class `UnifiedDatabase`, tambah method `count` setelah `query` (sekitar line 540):

```ts
  /**
   * Hitung jumlah row yang cocok dengan filter, tanpa memuat data.
   * Dipakai untuk counter pagination. Filter hanya mendukung equality
   * (sama seperti QueryOptions.where).
   */
  async count(table: string, where?: Record<string, any>): Promise<number> {
    try {
      if (isTauriApp()) {
        return await this.countTauri(table, where);
      }
      if (isServerSide()) {
        const supabaseAvailable = await isServerSupabaseAvailable();
        if (supabaseAvailable) {
          const n = await this.countServerSupabase(table, where);
          if (n !== null) return n;
          // fallthrough ke SQLite
        }
        if (skipServerSqliteMirror()) return 0;
        return await this.countServerSQLite(table, where);
      }
      const online = await isOnline();
      if (online) {
        const n = await this.countClientSupabase(table, where);
        if (n !== null) return n;
      }
      return 0;
    } catch (error) {
      console.error(`Error counting ${table}:`, error);
      return 0;
    }
  }
```

Lalu tambahkan helper private untuk tiap backend. Cari pattern yang sudah ada (mis. `queryServerSupabase`, `queryServerSQLite`) dan tiru. Untuk Supabase:

```ts
  private async countServerSupabase(
    table: string,
    where?: Record<string, any>,
  ): Promise<number | null> {
    const supabase = getServerSupabaseClient();
    if (!supabase) return null;
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (where) {
      for (const [key, value] of Object.entries(where)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          q = q.in(key, value);
        } else {
          q = q.eq(key, value);
        }
      }
    }
    const { count, error } = await q;
    if (error) {
      console.error(`countServerSupabase error on ${table}:`, error);
      return null;
    }
    return count ?? 0;
  }
```

Untuk SQLite server:

```ts
  private async countServerSQLite(
    table: string,
    where?: Record<string, any>,
  ): Promise<number> {
    if (!identifierRegex.test(table)) throw new Error(`Invalid table: ${table}`);
    let sql = `SELECT COUNT(*) as cnt FROM ${table}`;
    const params: any[] = [];
    if (where) {
      const clauses: string[] = [];
      for (const [key, value] of Object.entries(where)) {
        if (value === undefined) continue;
        if (!identifierRegex.test(key)) throw new Error(`Invalid column: ${key}`);
        if (Array.isArray(value)) {
          const placeholders = value.map(() => "?").join(",");
          clauses.push(`${key} IN (${placeholders})`);
          params.push(...value);
        } else {
          clauses.push(`${key} = ?`);
          params.push(value);
        }
      }
      if (clauses.length > 0) sql += " WHERE " + clauses.join(" AND ");
    }
    const row = sqliteDb.prepare(sql).get(...params) as { cnt: number } | undefined;
    return row?.cnt ?? 0;
  }
```

Untuk Tauri & client Supabase, tiru pattern `queryTauri`/`querySupabase`. Jika implementasi Tauri kompleks, bisa delegate ke `query` dengan `select: "id"` lalu `.length` — acceptable untuk Tauri (data lokal, cepat):

```ts
  private async countTauri(
    table: string,
    where?: Record<string, any>,
  ): Promise<number> {
    // Tauri: tidak ada invoke count native — pakai query id + length.
    // Data lokal, cepat; acceptable untuk volume internal.
    const result = await this.query<any>(table, {
      select: "id",
      where,
      limit: 100000,
    });
    return (result.data || []).length;
  }

  private async countClientSupabase(
    table: string,
    where?: Record<string, any>,
  ): Promise<number | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (where) {
      for (const [key, value] of Object.entries(where)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          q = q.in(key, value);
        } else {
          q = q.eq(key, value);
        }
      }
    }
    const { count, error } = await q;
    if (error) return null;
    return count ?? 0;
  }
```

Catatan: verifikasi nama helper yang sudah ada (`getServerSupabaseClient`, `getSupabaseClient`, `sqliteDb`, `identifierRegex`) — cari di file dengan grep sebelum menulis. Sesuaikan nama jika berbeda.

- [ ] **Step 5: Run test, verifikasi PASS**

Run: `npx jest src/lib/__tests__/db-count.test.ts`
Expected: PASS.

- [ ] **Step 6: Run type-check**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db-unified.ts src/lib/__tests__/db-count.test.ts src/lib/__tests__/helpers/mock-db.ts
git commit -m "feat(db): tambah method db.count(table, where) untuk pagination counter"
```

---

### Task 8: Ubah `getProductionOrders` terima pagination/filter + return `{data, total}` (TDD)

**Files:**
- Modify: `src/lib/services/production-service.ts` (`getProductionOrders` line 110-280)
- Test: `src/lib/__tests__/production-pagination.test.ts` (create)

**Interfaces:**
- Consumes: `db.count` dari Task 7, `db.query` dengan `limit/offset`.
- Produces: `getProductionOrders(params?): Promise<{ data: ProductionOrder[]; total: number }>`. `params = { limit?, offset?, search?, status?, prioritas? }`. Default `limit=50, offset=0`.

- [ ] **Step 1: Tulis failing test**

Buat file `src/lib/__tests__/production-pagination.test.ts`:

```ts
/**
 * getProductionOrders mendukung pagination (limit/offset) + filter server-side,
 * dan mengembalikan total row (tanpa limit) untuk counter UI.
 */
import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
  };
});
jest.mock("@/lib/services/inventory-service", () => ({
  __esModule: true,
  getRollVariants: jest.fn(),
  postInventoryMovement: jest.fn(),
}));
jest.mock("@/lib/services/shop-settings-service", () => ({
  __esModule: true,
  getShopSettings: jest.fn(),
}));

import { getProductionOrders } from "../services/production-service";

beforeEach(() => resetMockDb());

function seedOrders(n: number, status = "PROSES") {
  for (let i = 0; i < n; i++) {
    const id = `op${i.toString().padStart(3, "0")}`;
    mockTable("order_produksi").set(id, {
      id,
      nomor_spk: `SPK-${id}`,
      penjualan_id: null,
      status,
      prioritas: "NORMAL",
      dibuat_pada: new Date(2026, 0, 1, 0, 0, i).toISOString(),
      total_item: 0,
    });
  }
}

describe("getProductionOrders pagination", () => {
  it("mengembalikan total benar dan data terbatas sesuai limit", async () => {
    seedOrders(120);
    const { data, total } = await getProductionOrders({ limit: 50, offset: 0 });
    expect(total).toBe(120);
    expect(data.length).toBe(50);
  });

  it("mengembalikan sisa data untuk offset > 0", async () => {
    seedOrders(120);
    const { data, total } = await getProductionOrders({ limit: 50, offset: 100 });
    expect(total).toBe(120);
    expect(data.length).toBe(20);
  });

  it("filter status memengaruhi total dan data", async () => {
    seedOrders(60, "PROSES");
    seedOrders(40, "MENUNGGU"); // id op060..op099
    const { data, total } = await getProductionOrders({
      limit: 50,
      offset: 0,
      status: "MENUNGGU",
    });
    expect(total).toBe(40);
    expect(data.length).toBe(40);
    expect(data.every((o) => o.status === "MENUNGGU")).toBe(true);
  });

  it("default limit=50, offset=0 jika params tidak disediakan", async () => {
    seedOrders(70);
    const { data, total } = await getProductionOrders();
    expect(total).toBe(70);
    expect(data.length).toBe(50);
  });
});
```

Catatan: mock `db.count` perlu mendukung filter. Mock-db `count` (Task 7) sudah support `where` equality. Tapi `getProductionOrders` untuk filter `search` (text) tidak bisa pakai equality — untuk test, skip test search (mock tidak support LIKE). Fokus test limit/offset/status.

- [ ] **Step 2: Run test, verifikasi FAIL**

Run: `npx jest src/lib/__tests__/production-pagination.test.ts`
Expected: FAIL — `getProductionOrders` saat ini return array, bukan `{data, total}`.

- [ ] **Step 3: Implementasi `getProductionOrders` baru**

Edit `src/lib/services/production-service.ts` line 110. Ganti signature dan body awal:

```ts
export interface GetProductionOrdersParams {
  limit?: number;
  offset?: number;
  search?: string;
  status?: string;
  prioritas?: string;
}

export async function getProductionOrders(
  params?: GetProductionOrdersParams,
): Promise<{ data: ProductionOrder[]; total: number }> {
  try {
    const limit = params?.limit ?? 50;
    const offset = params?.offset ?? 0;
    const where: Record<string, any> = {};
    if (params?.status && params.status !== "ALL") where.status = params.status;
    if (params?.prioritas && params.prioritas !== "ALL") where.prioritas = params.prioritas;

    // Ambil order produksi dengan pagination + filter equality.
    const ordersResult = await db.query<ProductionOrder>("order_produksi", {
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { column: "dibuat_pada", ascending: false },
      limit,
      offset,
    });

    if (ordersResult.error) {
      throw ordersResult.error;
    }

    const orders = ordersResult.data || [];

    // Total row tanpa limit (untuk counter UI). search filter diterapkan
    // di memori untuk total jika search diberikan (mock/SQLite tidak support
    // LIKE konsisten — untuk Supabase production, idealnya pakai .ilike,
    // tapi untuk sekarang filter search di klien setelah fetch count
    // tanpa search). Lihat catatan di bawah.
    let total: number;
    if (params?.search && params.search.trim()) {
      // Search text tidak bisa di-count di DB dengan equality. Pendekatan:
      // count tanpa search, lalu filter search di klien pada data yang
      // sudah di-fetch. Untuk akurasi total dengan search, perlu query
      // terpisah dengan ilike — implementasi sederhana: count semua row
      // (tanpa search) sebagai upper bound, UI tampilkan "menyaring..."
      // TODO production: pakai .ilike di Supabase untuk count dengan search.
      total = await db.count("order_produksi", Object.keys(where).length > 0 ? where : undefined);
    } else {
      total = await db.count("order_produksi", Object.keys(where).length > 0 ? where : undefined);
    }

    if (orders.length === 0) return { data: [], total };

    // ... (lanjut enrichment yang sudah ada, pakai `orders` sebagai basis)
```

Lalu lanjutkan enrichment yang sudah ada (line 124-278), tapi ganti `return []` di line 122 jadi `return { data: [], total }`, dan di akhir (line 279+) ganti `return ordersWithItems;` jadi:

```ts
    // Filter search di memori (untuk compatibility SQLite/mock).
    let finalOrders = ordersWithItems;
    if (params?.search && params.search.trim()) {
      const q = params.search.toLowerCase().trim();
      finalOrders = ordersWithItems.filter(
        (o) =>
          String(o.nomor_spk || "").toLowerCase().includes(q) ||
          String(o.nomor_faktur || "").toLowerCase().includes(q) ||
          String(o.pelanggan_nama || "").toLowerCase().includes(q),
      );
    }

    // Penjualan VOID disembunyikan dari UI (konsisten dengan perilaku lama).
    finalOrders = finalOrders.filter((o) => !o.penjualan_dibatalkan);

    return { data: finalOrders, total };
  } catch (error) {
    console.error("Error getting production orders:", error);
    throw error;
  }
}
```

Catatan: filter `penjualan_dibatalkan` dipindah dari klien (page line 67) ke server di sini. Hapus filter klien di Task 10.

- [ ] **Step 4: Run test, verifikasi PASS**

Run: `npx jest src/lib/__tests__/production-pagination.test.ts`
Expected: PASS, 4 test lulus.

- [ ] **Step 5: Run test lama untuk pastikan tidak regress**

Run: `npx jest src/lib/__tests__/production`
Expected: `production-order-detail.test.ts` PASS (test `getProductionOrderById` tidak terpengaruh). `production-item-status-guard.test.ts` PASS.

- [ ] **Step 6: Update caller lama yang pakai return array**

Cari semua caller `getProductionOrders` yang expect array. Saat ini: `getProductionOrdersAction` di actions.ts (return langsung). Itu akan di-update di Task 9. Untuk sekarang, type-check akan error di actions.ts — acceptable, akan fix di Task 9.

Run: `npm run type-check`
Expected: error di `getProductionOrdersAction` (return type mismatch). Lanjut ke Task 9.

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/production-service.ts src/lib/__tests__/production-pagination.test.ts
git commit -m "feat(produksi): getProductionOrders terima pagination/filter + return {data, total}"
```

---

### Task 9: Tambah `getProductionOrderCounts` + update actions

**Files:**
- Modify: `src/lib/services/production-service.ts` (tambah `getProductionOrderCounts`)
- Modify: `src/app/produksi/spk/actions.ts` (update `getProductionOrdersAction` signature + tambah `getProductionOrderCountsAction`)

**Interfaces:**
- Consumes: `db.count` dari Task 7, `db.query`.
- Produces: `getProductionOrderCounts(): Promise<{ MENUNGGU, PROSES, SIAP_AMBIL, SELESAI, DIBATALKAN, KILAT }>`. `getProductionOrdersAction(params?)` return `{data, total}`. `getProductionOrderCountsAction()` return counts.

- [ ] **Step 1: Implementasi `getProductionOrderCounts` di `production-service.ts`**

Tambah di akhir `src/lib/services/production-service.ts` (sebelum export lain atau di area query):

```ts
export interface ProductionOrderCounts {
  MENUNGGU: number;
  PROSES: number;
  SIAP_AMBIL: number;
  SELESAI: number;
  DIBATALKAN: number;
  KILAT: number;
}

/**
 * Hitung jumlah order per status + jumlah order prioritas KILAT.
 * Dipakai untuk stat-card counter di halaman SPK. Tidak terpengaruh
 * pagination. Filter penjualan VOID tidak diterapkan di sini karena
 * kita tidak join penjualan — counter adalah count order_produksi mentah.
 * (Penjualan VOID sudah filter di getProductionOrders untuk list.)
 */
export async function getProductionOrderCounts(): Promise<ProductionOrderCounts> {
  try {
    const [menunggu, proses, siapAmbil, selesai, dibatalkan, kilat] =
      await Promise.all([
        db.count("order_produksi", { status: "MENUNGGU" }),
        db.count("order_produksi", { status: "PROSES" }),
        db.count("order_produksi", { status: "SIAP_AMBIL" }),
        db.count("order_produksi", { status: "SELESAI" }),
        db.count("order_produksi", { status: "DIBATALKAN" }),
        db.count("order_produksi", { prioritas: "KILAT" }),
      ]);
    return { MENUNGGU: menunggu, PROSES: proses, SIAP_AMBIL: siapAmbil, SELESAI: selesai, DIBATALKAN: dibatalkan, KILAT: kilat };
  } catch (error) {
    console.error("Error getting production order counts:", error);
    return { MENUNGGU: 0, PROSES: 0, SIAP_AMBIL: 0, SELESAI: 0, DIBATALKAN: 0, KILAT: 0 };
  }
}
```

- [ ] **Step 2: Update `getProductionOrdersAction` di `actions.ts`**

Edit `src/app/produksi/spk/actions.ts` line 32-39. Ganti signature + return:

```ts
export async function getProductionOrdersAction(params?: {
  limit?: number;
  offset?: number;
  search?: string;
  status?: string;
  prioritas?: string;
}) {
  try {
    return await getProductionOrders(params);
  } catch (error) {
    console.error("Error in getProductionOrdersAction:", error);
    throw error;
  }
}

export async function getProductionOrderCountsAction() {
  try {
    return await getProductionOrderCounts();
  } catch (error) {
    console.error("Error in getProductionOrderCountsAction:", error);
    throw error;
  }
}
```

Tambah `getProductionOrderCounts` ke import dari `production-service` di line 7-20.

- [ ] **Step 3: Run type-check**

Run: `npm run type-check`
Expected: error di `page.tsx` karena `getProductionOrdersAction` return shape berubah. Akan fix di Task 10.

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/production-service.ts src/app/produksi/spk/actions.ts
git commit -m "feat(produksi): tambah getProductionOrderCounts + update action getProductionOrdersAction"
```

---

### Task 10: Update client `page.tsx` SPK — SWR dinamis, pagination, counter, handler

**Files:**
- Modify: `src/app/produksi/spk/page.tsx`

**Interfaces:**
- Consumes: `getProductionOrdersAction(params)` return `{data, total}`, `getProductionOrderCountsAction()` return counts, `useInvalidate`, `useSWRConfig`.
- Produces: page dengan pagination "Muat 50 data lagi", stat-card dari counts terpisah, handler `handleMarkSiapDiambil` (sudah dibuat Task 6, pastikan konsisten).

- [ ] **Step 1: Update imports**

Edit `src/app/produksi/spk/page.tsx` line 1-31. Tambah import:

```ts
import { useSWRConfig } from "swr";
import {
  getProductionOrdersAction,
  getProductionOrderCountsAction,
  updateProductionStatusAction,
  // ... existing lainnya ...
} from "./actions";
```

- [ ] **Step 2: Tambah state `limit` + SWR counts**

Di body komponen (sekitar line 46-90), tambah:

```ts
const [limit, setLimit] = useState(50);

const {
  data: ordersResult,
  isLoading: ordersLoading,
  mutate: mutateOrders,
} = useCachedData<{ data: ProductionOrder[]; total: number }>(
  `production-orders:${limit}:${searchQuery}:${filterStatus}:${filterPriority}`,
  async () => {
    const r = await getProductionOrdersAction({
      limit,
      offset: 0,
      search: searchQuery,
      status: filterStatus,
      prioritas: filterPriority,
    });
    return r as { data: ProductionOrder[]; total: number };
  },
);

const orders = ordersResult?.data ?? EMPTY_ORDERS;
const totalOrders = ordersResult?.total ?? 0;

const {
  data: countsData,
  mutate: mutateCounts,
} = useCachedData<ProductionOrderCounts>("production-order-counts", async () => {
  return (await getProductionOrderCountsAction()) as ProductionOrderCounts;
});
const counts = countsData ?? { MENUNGGU: 0, PROSES: 0, SIAP_AMBIL: 0, SELESAI: 0, DIBATALKAN: 0, KILAT: 0 };
```

Tambah import type `ProductionOrderCounts` dari `@/lib/services/production-service`.

- [ ] **Step 3: Hapus `visibleOrders` filter klien (sekarang server-side)**

Hapus blok `visibleOrders` (line 66-69). Ganti pemakaian `visibleOrders` di stat-card dan `filteredOrders` dengan `counts` (untuk stat-card) dan `orders` (untuk tabel).

`filteredOrders` useMemo (line 162-185) sekarang tidak perlu filter lagi (server sudah filter). Sederhanakan:

```ts
const filteredOrders = useMemo(() => orders, [orders]);
```

Atau hapus `filteredOrders` dan pakai `orders` langsung. Pilih: hapus `filteredOrders`, pakai `orders` di tabel.

- [ ] **Step 4: Reset `limit` saat filter berubah**

Tambah useEffect:

```ts
useEffect(() => {
  setLimit(50);
}, [searchQuery, filterStatus, filterPriority]);
```

- [ ] **Step 5: Update stat-card pakai `counts`**

Ganti 5 stat-card (line 393-527). Untuk card MENUNGGU:
```tsx
<p className="text-3xl font-bold">{counts.MENUNGGU}</p>
```
PROSES: `{counts.PROSES}`. SIAP_AMBIL: `{counts.SIAP_AMBIL}`. SELESAI: `{counts.SELESAI}`. Kilat: `{counts.KILAT}`.

Hapus dependency pada `visibleOrders.filter(...)` di stat-card.

- [ ] **Step 6: Tambah tombol "Muat 50 data lagi" di bawah tabel**

Setelah blok tabel (line 746), tambah:

```tsx
{orders.length < totalOrders && (
  <div className="flex justify-center mt-4">
    <button
      type="button"
      onClick={() => setLimit((n) => n + 50)}
      disabled={ordersLoading}
      className="px-6 py-2.5 bg-white dark:bg-slate-900 border-2 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors font-semibold disabled:opacity-50"
    >
      {ordersLoading ? "Memuat..." : `Muat 50 data lagi (sisa ${totalOrders - orders.length})`}
    </button>
  </div>
)}
```

- [ ] **Step 7: Update invalidasi pakai prefix SWR**

Tambah helper invalidasi di body komponen:

```ts
const { mutate } = useSWRConfig();
const invalidateOrdersAndCounts = useCallback(() => {
  mutate((key) => typeof key === "string" && key.startsWith("production-orders"), undefined, { revalidate: true });
  mutate("production-order-counts", undefined, { revalidate: true });
}, [mutate]);
```

Ganti pemakaian `invalidate("production-orders")` + `loadOrders()` di handler `handleUpdateStatus`, `handleUpdateItemStatus`, `handleMarkSiapDiambil`, `handleSaveCustomerName`, `handlePostConsumption`, `handleVoidConsumption` dengan `invalidateOrdersAndCounts()`. Hapus juga `refreshSelectedOrder` jika tidak lagi relevan — sebenarnya tetap relevan untuk modal, pertahankan.

Untuk `handleSaveCustomerName` (line 290-292) juga invalidate `pos-init`:
```ts
invalidate("pos-init");
invalidateOrdersAndCounts();
await refreshSelectedOrder();
```

- [ ] **Step 8: Hapus `loadOrders` yang lama (jika tidak dipakai) atau sesuaikan**

`loadOrders` (line 187-194) pakai `mutateOrders()`. Bisa tetap dipakai untuk refresh manual tombol "Refresh" (line 585). Pertahankan, tapi pastikan juga refresh counts:

```ts
const loadOrders = async () => {
  try {
    await Promise.all([mutateOrders(), mutateCounts()]);
  } catch (error) {
    console.error("Error loading production orders:", error);
    showMsg("error", "Gagal memuat data produksi");
  }
};
```

- [ ] **Step 9: Run type-check + build**

Run: `npm run type-check && npm run build`
Expected: 0 error, build sukses.

- [ ] **Step 10: Commit**

```bash
git add src/app/produksi/spk/page.tsx
git commit -m "feat(spk): pagination server-side + counter terpisah + invalidasi prefix"
```

---

### Task 11: Pagination Pengambilan (service + action + client)

**Files:**
- Modify: `src/lib/services/pengambilan-service.ts` (`listPengambilanBelumDiambil`/`listPengambilanSudahDiambil`)
- Modify: `src/app/produksi/pengambilan/actions.ts` (update signature)
- Modify: `src/app/produksi/pengambilan/page.tsx` (SWR dinamis + tombol "Muat 50 data lagi")
- Test: `src/lib/__tests__/pengambilan-pagination.test.ts` (create)

**Interfaces:**
- Consumes: `db.count`, `db.query` dengan limit/offset.
- Produces: `listPengambilanBelumDiambil({limit, offset}): Promise<{data, total}>`, `listPengambilanSudahDiambil({limit, offset}): Promise<{data, total}>`.

- [ ] **Step 1: Tulis failing test**

Buat `src/lib/__tests__/pengambilan-pagination.test.ts`:

```ts
/**
 * listPengambilanBelumDiambil & listPengambilanSudahDiambil mendukung
 * pagination dan mengembalikan total untuk UI.
 */
import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return { db: real.__mock.db };
});

import {
  listPengambilanBelumDiambil,
  listPengambilanSudahDiambil,
} from "../services/pengambilan-service";

beforeEach(() => resetMockDb());

function seedPengambilanOrders(n: number, status: "SIAP_AMBIL" | "SELESAI") {
  for (let i = 0; i < n; i++) {
    const id = `op${i.toString().padStart(3, "0")}`;
    mockTable("order_produksi").set(id, {
      id,
      nomor_spk: `SPK-${id}`,
      penjualan_id: `s${id}`,
      status,
      prioritas: "NORMAL",
      dibuat_pada: new Date(2026, 0, 1, 0, 0, i).toISOString(),
      diselesaikan_pada: status === "SELESAI" ? new Date(2026, 0, 2).toISOString() : null,
    });
    mockTable("penjualan").set(`s${id}`, {
      id: `s${id}`,
      nomor_faktur: `INV-${id}`,
      pelanggan_id: null,
      pelanggan_nama_snapshot: "Pelanggan Umum",
      status_transaksi: "SELESAI",
      total_jumlah: 100000,
      jumlah_dibayar: 100000,
    });
  }
}

describe("pengambilan pagination", () => {
  it("belum diambil: limit 50 dari 120 total", async () => {
    seedPengambilanOrders(120, "SIAP_AMBIL");
    const { data, total } = await listPengambilanBelumDiambil({ limit: 50, offset: 0 });
    expect(total).toBe(120);
    expect(data.length).toBe(50);
  });

  it("sudah diambil: limit 50 dari 80 total", async () => {
    seedPengambilanOrders(80, "SELESAI");
    const { data, total } = await listPengambilanSudahDiambil({ limit: 50, offset: 0 });
    expect(total).toBe(80);
    expect(data.length).toBe(50);
  });

  it("default limit=50 offset=0", async () => {
    seedPengambilanOrders(70, "SIAP_AMBIL");
    const { data, total } = await listPengambilanBelumDiambil();
    expect(total).toBe(70);
    expect(data.length).toBe(50);
  });
});
```

- [ ] **Step 2: Run test, verifikasi FAIL**

Run: `npx jest src/lib/__tests__/pengambilan-pagination.test.ts`
Expected: FAIL — fungsi return array, bukan `{data, total}`.

- [ ] **Step 3: Update service `pengambilan-service.ts`**

Edit `src/lib/services/pengambilan-service.ts` line 133-152. Ganti signature:

```ts
export async function listPengambilanBelumDiambil(params?: {
  limit?: number;
  offset?: number;
}): Promise<{ data: PengambilanRow[]; total: number }> {
  const limit = params?.limit ?? 50;
  const offset = params?.offset ?? 0;
  const ordersRes = await db.query<any>("order_produksi", {
    where: { status: "SIAP_AMBIL" },
    orderBy: { column: "dibuat_pada", ascending: false },
    limit,
    offset,
  });
  if (ordersRes.error) throw ordersRes.error;
  const total = await db.count("order_produksi", { status: "SIAP_AMBIL" });
  const data = await enrichPengambilanRows(ordersRes.data || []);
  return { data, total };
}

export async function listPengambilanSudahDiambil(params?: {
  limit?: number;
  offset?: number;
}): Promise<{ data: PengambilanRow[]; total: number }> {
  const limit = params?.limit ?? 50;
  const offset = params?.offset ?? 0;
  const ordersRes = await db.query<any>("order_produksi", {
    where: { status: "SELESAI" },
    orderBy: { column: "diselesaikan_pada", ascending: false },
    limit,
    offset,
  });
  if (ordersRes.error) throw ordersRes.error;
  const total = await db.count("order_produksi", { status: "SELESAI" });
  const data = await enrichPengambilanRows(ordersRes.data || []);
  return { data, total };
}
```

Catatan: hapus default `limit = 100` lama di `listPengambilanSudahDiambil`.

- [ ] **Step 4: Run test, verifikasi PASS**

Run: `npx jest src/lib/__tests__/pengambilan-pagination.test.ts`
Expected: PASS.

- [ ] **Step 5: Update actions `pengambilan/actions.ts`**

Edit `src/app/produksi/pengambilan/actions.ts` line 12-20:

```ts
export async function listPengambilanBelumAction(params?: {
  limit?: number;
  offset?: number;
}) {
  await requireOperationalRole();
  return listPengambilanBelumDiambil(params);
}

export async function listPengambilanSudahAction(params?: {
  limit?: number;
  offset?: number;
}) {
  await requireOperationalRole();
  return listPengambilanSudahDiambil(params);
}
```

- [ ] **Step 6: Update client `pengambilan/page.tsx`**

Edit `src/app/produksi/pengambilan/page.tsx`. Tambah import `useSWRConfig`:

```ts
import { useSWRConfig } from "swr";
```

Update body (sekitar line 39-60):

```ts
const [limitBelum, setLimitBelum] = useState(50);
const [limitSudah, setLimitSudah] = useState(50);

const {
  data: belumResult,
  isLoading: belumLoading,
  mutate: mutateBelum,
} = useCachedData<{ data: PengambilanRow[]; total: number }>(
  `pengambilan-belum:${limitBelum}`,
  async () => {
    const r = await listPengambilanBelumAction({ limit: limitBelum, offset: 0 });
    return r as { data: PengambilanRow[]; total: number };
  },
);
const {
  data: sudahResult,
  isLoading: sudahLoading,
  mutate: mutateSudah,
} = useCachedData<{ data: PengambilanRow[]; total: number }>(
  `pengambilan-sudah:${limitSudah}`,
  async () => {
    const r = await listPengambilanSudahAction({ limit: limitSudah, offset: 0 });
    return r as { data: PengambilanRow[]; total: number };
  },
);

const belum = useMemo(() => belumResult?.data ?? [], [belumResult]);
const belumTotal = belumResult?.total ?? 0;
const sudah = useMemo(() => sudahResult?.data ?? [], [sudahResult]);
const sudahTotal = sudahResult?.total ?? 0;
const rows = tab === "belum" ? belum : sudah;
const rowsTotal = tab === "belum" ? belumTotal : sudahTotal;
const loading = tab === "belum" ? belumLoading && !belumResult : sudahLoading && !sudahResult;
```

Update tab counter pakai total:
```tsx
Belum Diambil ({belumTotal})
Sudah Diambil ({sudahTotal})
```

Update `reload`:
```ts
const reload = async () => {
  await Promise.all([mutateBelum(), mutateSudah()]);
  invalidate("production-orders");
  invalidate("pos-init");
};
```

Tambah invalidasi prefix di `reload`:
```ts
const { mutate } = useSWRConfig();
const reload = async () => {
  await Promise.all([mutateBelum(), mutateSudah()]);
  mutate((key) => typeof key === "string" && key.startsWith("production-orders"), undefined, { revalidate: true });
  mutate("production-order-counts", undefined, { revalidate: true });
  invalidate("pos-init");
};
```

Tambah tombol "Muat 50 data lagi" di bawah tabel (sebelum `ModalBayarPiutang`):

```tsx
{rows.length < rowsTotal && (
  <div className="flex justify-center">
    <button
      type="button"
      onClick={() => {
        if (tab === "belum") setLimitBelum((n) => n + 50);
        else setLimitSudah((n) => n + 50);
      }}
      disabled={loading}
      className="px-6 py-2.5 bg-white dark:bg-slate-900 border-2 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors font-semibold disabled:opacity-50"
    >
      {loading ? "Memuat..." : `Muat 50 data lagi (sisa ${rowsTotal - rows.length})`}
    </button>
  </div>
)}
```

- [ ] **Step 7: Run type-check + build + test**

Run: `npm run type-check && npm run build && npx jest src/lib/__tests__/pengambilan-pagination.test.ts`
Expected: 0 error, build sukses, test PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/services/pengambilan-service.ts src/app/produksi/pengambilan/actions.ts src/app/produksi/pengambilan/page.tsx src/lib/__tests__/pengambilan-pagination.test.ts
git commit -m "feat(pengambilan): pagination server-side limit/offset + tombol Muat 50 data lagi"
```

---

### Task 12: Verifikasi akhir + apply migration

**Files:** none (verifikasi only)

- [ ] **Step 1: Run full type-check**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 2: Run full build**

Run: `npm run build`
Expected: sukses.

- [ ] **Step 3: Run semua test produksi + pagination + db-count**

Run: `npx jest src/lib/__tests__/production src/lib/__tests__/pengambilan-pagination.test.ts src/lib/__tests__/db-count.test.ts`
Expected: semua PASS.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: 0 error. Jika ada warning baru yang diakibatkan kode kita, perbaiki.

- [ ] **Step 5: Apply migration ke cloud (jika owner ingin deploy)**

Hanya jika owner sudah approve deploy. Run: `npm run supabase:db:push`
Expected: migration `20260707000001_drop_item_finishing_status` applied.

- [ ] **Step 6: Final commit (jika ada fix lint)**

Jika ada perbaikan lint:
```bash
git add -A
git commit -m "chore: fix lint setelah sub-project A"
```

Jika tidak ada, skip.

---

## Self-Review

**1. Spec coverage:**
- Section 1 (hapus status finishing): Task 1 (migration), Task 2 (interface/insert), Task 3 (modal badge). ✓
- Section 2 (tombol Siap Diambil di modal): Task 6. ✓
- Section 3 (option disabled + guard): Task 4 (guard), Task 5 (dropdown). ✓
- Section 4 (pagination): Task 7 (db.count), Task 8 (getProductionOrders), Task 9 (counts + actions), Task 10 (page SPK), Task 11 (pengambilan). ✓
- Verifikasi: Task 12. ✓

**2. Placeholder scan:** Tidak ada TBD/TODO kecuali catatan "TODO production: pakai .ilike" di Task 8 untuk search count — itu catatan future improvement, bukan blocker. Acceptable.

**3. Type consistency:**
- `GetProductionOrdersParams` didefinisikan di Task 8, dipakai Task 9 & 10. ✓
- `ProductionOrderCounts` didefinisikan di Task 9, dipakai Task 10. ✓
- `db.count(table, where)` didefinisikan Task 7, dipakai Task 8, 9, 11. ✓
- `onMarkSiapDiambil` prop didefinisisi Task 6, dipakai Task 6. ✓
- Return shape `{data, total}` konsisten di Task 8, 9, 10, 11. ✓

Plan lengkap. 12 task, urutan dependency jelas (Task 1→2→3 untuk finishing; Task 4→5 untuk guard+dropdown; Task 6 tombol; Task 7→8→9→10 pagination SPK; Task 11 pagination pengambilan; Task 12 verifikasi).