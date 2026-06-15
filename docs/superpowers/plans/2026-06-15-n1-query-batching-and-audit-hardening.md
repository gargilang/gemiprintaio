# N+1 Query Batching + Audit Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate every remaining N+1 query path in the read/enrichment layer using one consistent batching mechanism, and make the SQLite↔Postgres parity audit tool sound enough to use as a release gate.

**Architecture:** Add array-value support to the `where` clause of the unified DB layer (server Supabase → PostgREST `.in()`, server SQLite → `IN (?, …)`, plus the test mock) so one targeted batch query replaces every `Promise.all(ids.map(() => db.queryOne(...)))` loop and every full-table-then-filter scan. Introduce two shared helpers (`buildLookupMap`, `fetchChildrenByForeignKey`) in `enrich-utils.ts` and route every enrichment function through them so all call sites look identical. Finally, scope the audit's `runtimeHasColumn` check to the specific table and parse the sync-table list from source instead of hand-copying it.

**Tech Stack:** TypeScript, Next.js (App Router), Supabase JS (PostgREST), better-sqlite3, Jest (node project), Node ESM scripts.

---

## Why one mechanism (read before starting)

The data layer currently supports only equality `where` (`db-unified.ts`) and the test mock (`helpers/mock-db.ts`) throws on non-scalar `where` values. Two patterns exist in the codebase today:

- **Master lookups:** `Promise.all(ids.map(id => db.queryOne(table, { where: { id } })))` — N round-trips on Supabase (real N+1).
- **Child fetches:** `db.query(childTable, {})` then `.filter()` in memory — a full-table scan that also degrades as data grows.

Both are replaced by a single batch query keyed by exactly the ids we need: `db.query(table, { where: { id: idArray } })`. This scales for bounded master tables (`barang`, `vendor`, `profil`) **and** unbounded transaction tables (`penjualan`, `pembelian`), so we do not need two different strategies. Task 1 makes array `where` work everywhere; Task 2 wraps it in helpers; Tasks 3–9 convert every call site; Task 10 hardens the audit; Task 11 is the full-suite gate.

**Out of scope (documented, not changed):** the client-side query paths `querySupabase` / `queryTauri` in `db-unified.ts` are not touched — every enrichment function in this plan is `server-only` and runs through `queryServerSupabase` / `queryServerSQLite`. The pre-existing reverse-drift concern (SQLite→Postgres push of V2 columns on tables Postgres lacks) is also out of scope; it surfaces as a visible failure, not silent loss.

---

### Task 1: Array-value `where` support in the unified DB layer + test mock

**Files:**
- Modify: `src/lib/db-unified.ts` (server Supabase path ~L1003-1011, server SQLite path ~L823-833)
- Modify: `src/lib/__tests__/helpers/mock-db.ts:36-52`
- Test: `src/lib/__tests__/db-unified.test.ts` (append)

- [x] **Step 1: Write the failing test**

Append to `src/lib/__tests__/db-unified.test.ts`:

```ts
describe("array where → IN (mock parity for batch lookups)", () => {
  it("matches rows whose column value is in the array", () => {
    const { matchesWhere } = require("./helpers/mock-db-internal");
    // covered indirectly below; primary assertion is via the mock db.query
  });
});
```

If `db-unified.test.ts` does not already import the mock, instead add this self-contained block (uses the real mock through its public API):

```ts
import { resetMockDb, mockTable, __mock } from "./helpers/mock-db";

describe("array where → IN (batch lookups)", () => {
  beforeEach(() => resetMockDb());

  it("db.query with where: { id: [...] } returns only matching rows", async () => {
    mockTable("barang").set("b1", { id: "b1", nama: "A" });
    mockTable("barang").set("b2", { id: "b2", nama: "B" });
    mockTable("barang").set("b3", { id: "b3", nama: "C" });

    const res = await __mock.db.query("barang", { where: { id: ["b1", "b3"] } });
    const ids = (res.data || []).map((r: any) => r.id).sort();
    expect(ids).toEqual(["b1", "b3"]);
  });

  it("empty array matches nothing", async () => {
    mockTable("barang").set("b1", { id: "b1", nama: "A" });
    const res = await __mock.db.query("barang", { where: { id: [] } });
    expect(res.data).toEqual([]);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/db-unified.test.ts -t "array where" -v`
Expected: FAIL — the mock throws `mock-db: operator where belum didukung ... (hanya equality)` because `matchesWhere` rejects arrays.

- [x] **Step 3: Implement array support in the mock**

In `src/lib/__tests__/helpers/mock-db.ts`, replace the body of `matchesWhere` (currently L36-52):

```ts
function matchesWhere(row: any, where?: Record<string, unknown>): boolean {
  if (!where) return true;
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;
    // Array → IN semantics (batch lookups). Mirrors db-unified server paths.
    if (Array.isArray(value)) {
      if (!value.includes(row[key])) return false;
      continue;
    }
    // mock-db hanya mendukung filter equality + array IN. Operator objek
    // (mis. { gte, like }) belum didukung — lempar error eksplisit daripada
    // diam mengembalikan hasil salah (O-I3).
    if (value !== null && typeof value === "object") {
      throw new Error(
        `mock-db: operator where belum didukung untuk kolom "${key}" (hanya equality + array IN). ` +
          `Nilai: ${JSON.stringify(value)}`
      );
    }
    if (row[key] !== value) return false;
  }
  return true;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/__tests__/db-unified.test.ts -t "array where" -v`
Expected: PASS (2 tests).

- [x] **Step 5: Implement array support in the server Supabase path**

In `src/lib/db-unified.ts`, inside `queryServerSupabase`, replace the filter block (currently ~L1003-1011):

```ts
    // Apply filters
    if (options.where) {
      Object.entries(options.where).forEach(([key, value]) => {
        if (value === null) {
          query = query.is(key, null);
        } else if (Array.isArray(value)) {
          // Batch lookup: WHERE key IN (...). Empty array → matches nothing.
          query = query.in(key, value);
        } else {
          query = query.eq(key, value);
        }
      });
    }
```

- [x] **Step 6: Implement array support in the server SQLite path**

In `src/lib/db-unified.ts`, inside `queryServerSQLite`, replace the WHERE-building block (currently ~L823-833):

```ts
    // Build WHERE clause
    if (options.where && Object.keys(options.where).length > 0) {
      const conditions = Object.entries(options.where).map(([key, value]) => {
        assertSafeIdentifier(key);
        if (value === null) {
          return `${key} IS NULL`;
        }
        if (Array.isArray(value)) {
          // Batch lookup: WHERE key IN (?, ?, ...). Empty array → 0=1 (no rows).
          if (value.length === 0) return "0 = 1";
          const placeholders = value.map(() => "?").join(", ");
          for (const v of value) params.push(v);
          return `${key} IN (${placeholders})`;
        }
        params.push(value);
        return `${key} = ?`;
      });
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }
```

- [x] **Step 7: Verify type-check and full db-unified test pass**

Run: `npm run type-check`
Expected: 0 errors.
Run: `npx jest src/lib/__tests__/db-unified.test.ts -v`
Expected: all PASS (existing + 2 new).

- [x] **Step 8: Commit**

```bash
git add src/lib/db-unified.ts src/lib/__tests__/helpers/mock-db.ts src/lib/__tests__/db-unified.test.ts
git commit -m "feat(db): dukung where array (IN) di server Supabase + SQLite + mock"
```

---

### Task 2: Shared enrichment helpers (`buildLookupMap`, `fetchChildrenByForeignKey`)

**Files:**
- Create: `src/lib/services/enrich-utils.ts`
- Test: `src/lib/__tests__/enrich-utils.test.ts`

- [x] **Step 1: Write the failing test**

Create `src/lib/__tests__/enrich-utils.test.ts`:

```ts
/**
 * enrich-utils: helper batch lookup untuk menghapus N+1 di jalur enrichment.
 * Menguji perilaku nyata via mock db-unified (bukan stub per-panggilan).
 */
import { resetMockDb, mockTable, __mock } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
  };
});

import { buildLookupMap, fetchChildrenByForeignKey } from "../services/enrich-utils";

beforeEach(() => resetMockDb());

describe("buildLookupMap", () => {
  it("fetches only requested ids in a single query (no N+1)", async () => {
    mockTable("vendor").set("v1", { id: "v1", nama_perusahaan: "PT A" });
    mockTable("vendor").set("v2", { id: "v2", nama_perusahaan: "PT B" });
    mockTable("vendor").set("v3", { id: "v3", nama_perusahaan: "PT C" });

    const map = await buildLookupMap("vendor", ["v1", "v3"], "nama_perusahaan");

    expect(map.get("v1")?.nama_perusahaan).toBe("PT A");
    expect(map.get("v3")?.nama_perusahaan).toBe("PT C");
    expect(map.has("v2")).toBe(false);
    expect(__mock.db.query).toHaveBeenCalledTimes(1);
    expect(__mock.db.queryOne).not.toHaveBeenCalled();
  });

  it("dedupes ids and skips the query when the id set is empty", async () => {
    const empty = await buildLookupMap("vendor", []);
    expect(empty.size).toBe(0);
    expect(__mock.db.query).not.toHaveBeenCalled();

    mockTable("vendor").set("v1", { id: "v1", nama_perusahaan: "PT A" });
    await buildLookupMap("vendor", ["v1", "v1", "v1"]);
    expect(__mock.db.query).toHaveBeenCalledTimes(1);
  });
});

describe("fetchChildrenByForeignKey", () => {
  it("groups child rows by their foreign key in a single query", async () => {
    mockTable("item_pembelian").set("i1", { id: "i1", pembelian_id: "p1", nama: "x" });
    mockTable("item_pembelian").set("i2", { id: "i2", pembelian_id: "p1", nama: "y" });
    mockTable("item_pembelian").set("i3", { id: "i3", pembelian_id: "p2", nama: "z" });

    const map = await fetchChildrenByForeignKey("item_pembelian", "pembelian_id", ["p1", "p2"]);

    expect(map.get("p1")).toHaveLength(2);
    expect(map.get("p2")).toHaveLength(1);
    expect(__mock.db.query).toHaveBeenCalledTimes(1);
    expect(__mock.db.queryOne).not.toHaveBeenCalled();
  });

  it("returns an empty map when there are no parent ids", async () => {
    const map = await fetchChildrenByForeignKey("item_pembelian", "pembelian_id", []);
    expect(map.size).toBe(0);
    expect(__mock.db.query).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/enrich-utils.test.ts -v`
Expected: FAIL — `Cannot find module '../services/enrich-utils'`.

- [x] **Step 3: Implement the helpers**

Create `src/lib/services/enrich-utils.ts`:

```ts
import "server-only";

import { db } from "@/lib/db-unified";

/**
 * Ambil baris dari `table` yang `id`-nya ada di `ids`, kembalikan Map id→baris.
 * Satu query batch via `where { id: [...] }` (IN) — menghapus N+1 (dulu 1
 * queryOne per id). `ids` di-dedupe; set kosong men-skip query. Bila `select`
 * diberikan, kolom `id` otomatis ikut agar Map bisa dibangun.
 */
export async function buildLookupMap<T = any>(
  table: string,
  ids: Iterable<string>,
  select?: string
): Promise<Map<string, T>> {
  const idList = [...new Set(ids)].filter(Boolean) as string[];
  const map = new Map<string, T>();
  if (idList.length === 0) return map;

  let selectClause: string | undefined;
  if (select) {
    const cols = select.split(",").map((c) => c.trim());
    selectClause = cols.includes("id") ? select : `id,${select}`;
  }

  const res = await db.query<T>(table, {
    where: { id: idList },
    ...(selectClause ? { select: selectClause } : {}),
  });
  if (res.error) throw res.error;
  for (const row of (res.data || []) as any[]) {
    if (row?.id) map.set(row.id, row as T);
  }
  return map;
}

/**
 * Ambil baris anak dari `table` yang nilai `fkColumn`-nya ada di `parentIds`,
 * lalu kelompokkan jadi Map parentId→baris[]. Satu query batch via
 * `where { [fkColumn]: [...] }` (IN) — menggantikan full-table scan + filter.
 * Tidak memakai `select` karena pemanggil butuh seluruh kolom baris anak.
 */
export async function fetchChildrenByForeignKey<T = any>(
  table: string,
  fkColumn: string,
  parentIds: Iterable<string>
): Promise<Map<string, T[]>> {
  const idList = [...new Set(parentIds)].filter(Boolean) as string[];
  const map = new Map<string, T[]>();
  if (idList.length === 0) return map;

  const res = await db.query<T>(table, { where: { [fkColumn]: idList } });
  if (res.error) throw res.error;
  for (const row of (res.data || []) as any[]) {
    const key = row[fkColumn];
    const list = map.get(key) || [];
    list.push(row as T);
    map.set(key, list);
  }
  return map;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/__tests__/enrich-utils.test.ts -v`
Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```bash
git add src/lib/services/enrich-utils.ts src/lib/__tests__/enrich-utils.test.ts
git commit -m "feat(services): helper batch lookup enrich-utils (buildLookupMap, fetchChildrenByForeignKey)"
```

---

### Task 3: Refactor `enrichSessions` (stock opname)

**Files:**
- Modify: `src/lib/services/stock-opname-service.ts:12-38`
- Test: `src/lib/__tests__/stock-opname-service.test.ts` (append)

- [x] **Step 1: Write the failing test**

Append to `src/lib/__tests__/stock-opname-service.test.ts`. First add `__mock` to the existing helper import at the top of the file (change `import { resetMockDb, mockTable } from "./helpers/mock-db";` to include `__mock`):

```ts
import { resetMockDb, mockTable, __mock } from "./helpers/mock-db";
```

Then add `getStockOpnames` to the service import block and append this describe block at the end of the file:

```ts
describe("getStockOpnames enrichment (no N+1)", () => {
  it("attaches barang_nama to items without per-id queries", async () => {
    mockTable("barang").set("barang-1", { id: "barang-1", nama: "Tinta", satuan_dasar: "L" });
    mockTable("barang").set("barang-2", { id: "barang-2", nama: "Kertas", satuan_dasar: "rim" });
    mockTable("stock_opnames").set("so-1", { id: "so-1", dibuat_pada: "2026-05-25" });
    mockTable("stock_opname_items").set("soi-1", { id: "soi-1", stock_opname_id: "so-1", barang_id: "barang-1" });
    mockTable("stock_opname_items").set("soi-2", { id: "soi-2", stock_opname_id: "so-1", barang_id: "barang-2" });

    __mock.db.query.mockClear();
    __mock.db.queryOne.mockClear();

    const { getStockOpnames } = await import("../services/stock-opname-service");
    const sessions = await getStockOpnames();

    expect(sessions[0].items.map((i: any) => i.barang_nama).sort()).toEqual(["Kertas", "Tinta"]);
    expect(__mock.db.queryOne).not.toHaveBeenCalled();
  });
});
```

Note: `getStockOpnames` must be present in the file's service import. If the existing import only pulls mutation functions, add a separate `import { getStockOpnames } from "../services/stock-opname-service";` near the other imports instead of the inline dynamic import above, and call it directly.

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/stock-opname-service.test.ts -t "no N+1" -v`
Expected: FAIL — `expect(queryOne).not.toHaveBeenCalled()` fails (current code loops `db.queryOne` per barang id).

- [x] **Step 3: Implement the refactor**

In `src/lib/services/stock-opname-service.ts`, add the import after the existing imports:

```ts
import { buildLookupMap, fetchChildrenByForeignKey } from "./enrich-utils";
```

Replace the whole `enrichSessions` function (L12-38) with:

```ts
async function enrichSessions(rows: any[]) {
  const sessionIds = rows.map((row) => row.id);
  const itemsBySession = await fetchChildrenByForeignKey<any>(
    "stock_opname_items",
    "stock_opname_id",
    sessionIds
  );

  const barangIds = [...itemsBySession.values()]
    .flat()
    .map((item) => item.barang_id)
    .filter(Boolean);
  const barangMap = await buildLookupMap<{ id: string; nama: string }>(
    "barang",
    barangIds,
    "nama,satuan_dasar"
  );

  return rows.map((row) => ({
    ...row,
    items: (itemsBySession.get(row.id) || []).map((item) => ({
      ...item,
      barang_nama: barangMap.get(item.barang_id)?.nama || "",
    })),
  }));
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/__tests__/stock-opname-service.test.ts -v`
Expected: all PASS (existing + new).

- [x] **Step 5: Commit**

```bash
git add src/lib/services/stock-opname-service.ts src/lib/__tests__/stock-opname-service.test.ts
git commit -m "perf(n+1): batch enrichSessions (stock opname) via enrich-utils"
```

---

### Task 4: Refactor `enrichPurchaseOrders` (purchase order)

**Files:**
- Modify: `src/lib/services/purchase-order-service.ts:73-115`
- Test: `src/lib/__tests__/purchase-order-service.test.ts` (append)

- [ ] **Step 1: Write the failing test**

In `src/lib/__tests__/purchase-order-service.test.ts`, add `__mock` to the helper import:

```ts
import { resetMockDb, mockTable, __mock } from "./helpers/mock-db";
```

Add `getPurchaseOrders` to the service import block, then append:

```ts
describe("getPurchaseOrders enrichment (no N+1)", () => {
  it("attaches vendor_name and item barang_nama without per-id queries", async () => {
    mockTable("vendor").set("vendor-1", { id: "vendor-1", nama_perusahaan: "PT Vendor" });
    mockTable("barang").set("barang-1", { id: "barang-1", nama: "Tinta Hitam" });
    mockTable("purchase_orders").set("po-1", { id: "po-1", vendor_id: "vendor-1", dibuat_pada: "2026-05-25" });
    mockTable("purchase_order_items").set("poi-1", { id: "poi-1", purchase_order_id: "po-1", barang_id: "barang-1" });

    __mock.db.query.mockClear();
    __mock.db.queryOne.mockClear();

    const orders = await getPurchaseOrders();
    expect(orders[0].vendor_name).toBe("PT Vendor");
    expect(orders[0].items[0].barang_nama).toBe("Tinta Hitam");
    expect(__mock.db.queryOne).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/purchase-order-service.test.ts -t "no N+1" -v`
Expected: FAIL — `queryOne` called per barang/vendor id.

- [ ] **Step 3: Implement the refactor**

In `src/lib/services/purchase-order-service.ts`, add after the existing imports:

```ts
import { buildLookupMap, fetchChildrenByForeignKey } from "./enrich-utils";
```

Replace `enrichPurchaseOrders` (L73-115) with:

```ts
async function enrichPurchaseOrders(rows: any[]) {
  const poIds = rows.map((row) => row.id);
  const itemsByPo = await fetchChildrenByForeignKey<any>(
    "purchase_order_items",
    "purchase_order_id",
    poIds
  );

  const barangIds = [...itemsByPo.values()]
    .flat()
    .map((item) => item.barang_id)
    .filter(Boolean);
  const vendorIds = rows.map((row) => row.vendor_id).filter(Boolean);

  const [barangMap, vendorMap] = await Promise.all([
    buildLookupMap<{ id: string; nama: string }>("barang", barangIds, "nama"),
    buildLookupMap<{ id: string; nama_perusahaan: string }>(
      "vendor",
      vendorIds,
      "nama_perusahaan"
    ),
  ]);

  return rows.map((row) => ({
    ...row,
    vendor_name: row.vendor_id
      ? vendorMap.get(row.vendor_id)?.nama_perusahaan || null
      : null,
    items: (itemsByPo.get(row.id) || []).map((item) => ({
      ...item,
      barang_nama: barangMap.get(item.barang_id)?.nama || "",
    })),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/__tests__/purchase-order-service.test.ts -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/purchase-order-service.ts src/lib/__tests__/purchase-order-service.test.ts
git commit -m "perf(n+1): batch enrichPurchaseOrders via enrich-utils"
```

---

### Task 5: Refactor `enrichPurchaseRows` + `getDebts` (purchases queries)

**Files:**
- Modify: `src/lib/services/purchases-queries.ts:26-129` (enrichPurchaseRows), `:583-633` (getDebts)
- Create: `src/lib/__tests__/purchases-queries.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/purchases-queries.test.ts`:

```ts
/**
 * purchases-queries enrichment: batch lookup, no N+1.
 */
import { resetMockDb, mockTable, __mock } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
    getServerSupabaseClient: () => null,
  };
});

jest.mock("@/lib/server-data-supabase", () => ({
  __esModule: true,
  fetchLastNomorPembelian: jest.fn(),
  fetchLastNomorPembelianMaklon: jest.fn(),
}));
jest.mock("@/lib/services/finance-service", () => ({
  __esModule: true,
  recalculateCashbookIfAvailable: jest.fn(),
}));
jest.mock("@/lib/services/inventory-service", () => ({
  __esModule: true,
  convertRollVariant: jest.fn(),
  findOrCreateRollVariant: jest.fn(),
  getInventoryMovements: jest.fn(),
  postInventoryMovement: jest.fn(),
}));

import { enrichPurchaseRows, getDebts } from "../services/purchases-queries";

beforeEach(() => resetMockDb());

describe("enrichPurchaseRows (no N+1)", () => {
  it("attaches vendor, creator, and item names in batch", async () => {
    mockTable("vendor").set("v1", { id: "v1", nama_perusahaan: "PT V", alamat: "Jl" });
    mockTable("profil").set("u1", { id: "u1", nama_lengkap: "Budi" });
    mockTable("barang").set("b1", { id: "b1", nama: "Tinta" });
    mockTable("item_pembelian").set("ip1", {
      id: "ip1", pembelian_id: "p1", barang_id: "b1", jumlah: 2, harga_satuan: 1000, subtotal: 2000,
    });

    __mock.db.query.mockClear();
    __mock.db.queryOne.mockClear();

    const rows = [{ id: "p1", vendor_id: "v1", dibuat_oleh: "u1", total_jumlah: 2000 }];
    const result = await enrichPurchaseRows(rows);

    expect(result[0].vendor_name).toBe("PT V");
    expect(result[0].created_by_name).toBe("Budi");
    expect(result[0].items[0].nama_barang).toBe("Tinta");
    expect(__mock.db.queryOne).not.toHaveBeenCalled();
  });
});

describe("getDebts (no N+1)", () => {
  it("attaches vendor_name in batch and filters by status", async () => {
    mockTable("vendor").set("v1", { id: "v1", nama_perusahaan: "PT V" });
    mockTable("pembelian").set("p1", {
      id: "p1", vendor_id: "v1", tanggal: "2026-05-01",
      total_jumlah: 5000, jumlah_dibayar: 1000, status_pembayaran: "SEBAGIAN",
    });
    mockTable("pembelian").set("p2", {
      id: "p2", vendor_id: "v1", tanggal: "2026-05-02",
      total_jumlah: 1000, jumlah_dibayar: 1000, status_pembayaran: "LUNAS",
    });

    __mock.db.query.mockClear();
    __mock.db.queryOne.mockClear();

    const debts = await getDebts();
    expect(debts).toHaveLength(1);
    expect(debts[0].vendor_name).toBe("PT V");
    expect(debts[0].sisa_hutang).toBe(4000);
    expect(__mock.db.queryOne).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/purchases-queries.test.ts -v`
Expected: FAIL — `queryOne` called per vendor/creator/barang id.

- [ ] **Step 3: Implement `enrichPurchaseRows`**

In `src/lib/services/purchases-queries.ts`, add after the existing imports:

```ts
import { buildLookupMap, fetchChildrenByForeignKey } from "./enrich-utils";
```

Replace the body of `enrichPurchaseRows` from its start through the close of the vendor/creator/barang lookups and `itemsByPurchase` build (L26-98) with:

```ts
export async function enrichPurchaseRows(pembelianRows: any[]): Promise<Purchase[]> {
  if (pembelianRows.length === 0) return [];

  const purchaseIds = pembelianRows.map((p) => p.id);
  const itemsByPurchase = await fetchChildrenByForeignKey<any>(
    "item_pembelian",
    "pembelian_id",
    purchaseIds
  );

  const barangIds = [...itemsByPurchase.values()]
    .flat()
    .map((i) => i.barang_id)
    .filter(Boolean);
  const vendorIds = pembelianRows.map((p) => p.vendor_id).filter(Boolean);
  const creatorIds = pembelianRows.map((p) => p.dibuat_oleh).filter(Boolean);

  const [vendorMap, creatorMap, barangMap] = await Promise.all([
    buildLookupMap<{
      nama_perusahaan: string;
      alamat?: string;
      telepon?: string;
      kontak_person?: string;
    }>("vendor", vendorIds),
    buildLookupMap<{ nama_lengkap: string }>("profil", creatorIds, "nama_lengkap"),
    buildLookupMap<{ nama: string }>("barang", barangIds, "nama"),
  ]);

  for (const [, items] of itemsByPurchase) {
    for (const item of items) {
      item.nama_barang = barangMap.get(item.barang_id)?.nama;
    }
  }
```

Then the existing tail (the `return pembelianRows.map(...)` block, currently L100-128) stays, but its data sources now come from the maps above. Replace that tail block with:

```ts
  return pembelianRows.map((purchase) => {
    const rawItems = itemsByPurchase.get(purchase.id) || [];
    const items = normalizePurchaseItemsForUI(rawItems);
    const calculatedTotal = items.reduce(
      (sum: number, item: any) =>
        sum +
        (Number(item.subtotal) ||
          Number(item.jumlah || 0) *
            Number(item.harga_satuan || item.harga_beli || 0)),
      0
    );
    const total_harga =
      calculatedTotal > 0 ? calculatedTotal : Number(purchase.total_jumlah || 0);

    const vendor = purchase.vendor_id ? vendorMap.get(purchase.vendor_id) : undefined;

    return {
      ...purchase,
      vendor_name: vendor?.nama_perusahaan,
      vendor_alamat: vendor?.alamat,
      vendor_telepon: vendor?.telepon,
      vendor_kontak_person: vendor?.kontak_person,
      created_by_name: purchase.dibuat_oleh
        ? creatorMap.get(purchase.dibuat_oleh)?.nama_lengkap
        : undefined,
      items,
      total_harga,
    } as Purchase;
  });
}
```

- [ ] **Step 4: Implement `getDebts`**

Replace the vendor lookup block inside `getDebts` (the `vendorIds`/`Promise.all(...queryOne)` block, L604-615) with:

```ts
    const vendorIds = rows.map((r: any) => r.vendor_id).filter(Boolean);
    const vendorMap = await buildLookupMap<{ nama_perusahaan: string }>(
      "vendor",
      vendorIds,
      "nama_perusahaan"
    );
```

Then update the final `.map` row that reads `vendorMap.get(p.vendor_id)` (currently returns a string) to read `.nama_perusahaan`:

```ts
      vendor_name: p.vendor_id ? vendorMap.get(p.vendor_id)?.nama_perusahaan ?? null : null,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/lib/__tests__/purchases-queries.test.ts -v`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/purchases-queries.ts src/lib/__tests__/purchases-queries.test.ts
git commit -m "perf(n+1): batch enrichPurchaseRows + getDebts via enrich-utils"
```

---

### Task 6: Refactor `enrichReturns` (return service)

**Files:**
- Modify: `src/lib/services/return-service.ts:52-67`
- Test: `src/lib/__tests__/return-service.test.ts` (append)

- [ ] **Step 1: Write the failing test**

In `src/lib/__tests__/return-service.test.ts`, add `__mock` to the helper import:

```ts
import { resetMockDb, mockTable, __mock } from "./helpers/mock-db";
```

Add `getSalesReturns` to the service import block, then append:

```ts
describe("getSalesReturns enrichment (no N+1)", () => {
  it("attaches the source sale in batch", async () => {
    mockTable("penjualan").set("s1", { id: "s1", nomor_faktur: "INV-1" });
    mockTable("penjualan").set("s2", { id: "s2", nomor_faktur: "INV-2" });
    mockTable("retur_penjualan").set("r1", { id: "r1", penjualan_id: "s1", dibuat_pada: "2026-05-25" });
    mockTable("retur_penjualan").set("r2", { id: "r2", penjualan_id: "s2", dibuat_pada: "2026-05-26" });

    __mock.db.query.mockClear();
    __mock.db.queryOne.mockClear();

    const returns = await getSalesReturns();
    const byId = Object.fromEntries(returns.map((r: any) => [r.id, r]));
    expect(byId["r1"].source.nomor_faktur).toBe("INV-1");
    expect(byId["r2"].source.nomor_faktur).toBe("INV-2");
    expect(__mock.db.queryOne).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/return-service.test.ts -t "no N+1" -v`
Expected: FAIL — `queryOne` called per source id.

- [ ] **Step 3: Implement the refactor**

In `src/lib/services/return-service.ts`, add after the existing imports:

```ts
import { buildLookupMap } from "./enrich-utils";
```

Replace `enrichReturns` (L52-67) with:

```ts
async function enrichReturns(table: "retur_penjualan" | "retur_pembelian", rows: any[]) {
  const sourceTable = table === "retur_penjualan" ? "penjualan" : "pembelian";
  const sourceKey = table === "retur_penjualan" ? "penjualan_id" : "pembelian_id";
  const ids = rows.map((row) => row[sourceKey]).filter(Boolean);
  const sourceMap = await buildLookupMap<any>(sourceTable, ids);
  return rows.map((row) => ({
    ...row,
    source: sourceMap.get(row[sourceKey]) || null,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/__tests__/return-service.test.ts -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/return-service.ts src/lib/__tests__/return-service.test.ts
git commit -m "perf(n+1): batch enrichReturns via enrich-utils"
```

---

### Task 7: Refactor `getSuratJalan` SQLite fallback

**Files:**
- Modify: `src/lib/services/surat-jalan-service.ts:196-230`
- Create: `src/lib/__tests__/surat-jalan-service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/surat-jalan-service.test.ts`:

```ts
/**
 * surat-jalan-service: SQLite fallback enrichment, no N+1.
 * getServerSupabaseClient mocked → null forces the SQLite branch.
 */
import { resetMockDb, mockTable, __mock } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
    getServerSupabaseClient: () => null,
  };
});

import { getSuratJalan } from "../services/surat-jalan-service";

beforeEach(() => resetMockDb());

describe("getSuratJalan SQLite fallback (no N+1)", () => {
  it("attaches items, nomor_faktur, and dibuat_oleh_nama in batch", async () => {
    mockTable("penjualan").set("s1", { id: "s1", nomor_faktur: "INV-1" });
    mockTable("profil").set("u1", { id: "u1", nama_lengkap: "Budi" });
    mockTable("surat_jalan").set("sj1", {
      id: "sj1", penjualan_id: "s1", dibuat_oleh: "u1", dibuat_pada: "2026-05-25",
    });
    mockTable("surat_jalan").set("sj2", {
      id: "sj2", penjualan_id: null, dibuat_oleh: null, dibuat_pada: "2026-05-26",
    });
    mockTable("item_surat_jalan").set("isj1", { id: "isj1", surat_jalan_id: "sj1", urutan: 2 });
    mockTable("item_surat_jalan").set("isj2", { id: "isj2", surat_jalan_id: "sj1", urutan: 1 });

    __mock.db.query.mockClear();
    __mock.db.queryOne.mockClear();

    const list = await getSuratJalan();
    const byId = Object.fromEntries(list.map((s: any) => [s.id, s]));
    expect(byId["sj1"].nomor_faktur).toBe("INV-1");
    expect(byId["sj1"].dibuat_oleh_nama).toBe("Budi");
    expect(byId["sj1"].items.map((i: any) => i.urutan)).toEqual([1, 2]);
    expect(byId["sj2"].nomor_faktur).toBeNull();
    expect(__mock.db.queryOne).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/surat-jalan-service.test.ts -v`
Expected: FAIL — `queryOne` called per surat jalan for penjualan/profil.

- [ ] **Step 3: Implement the refactor**

In `src/lib/services/surat-jalan-service.ts`, add after the existing imports:

```ts
import { buildLookupMap, fetchChildrenByForeignKey } from "./enrich-utils";
```

Replace the SQLite fallback block (from `// SQLite fallback` at L196 through the closing of the `return await Promise.all(...)` at L230) with:

```ts
    // SQLite fallback
    const sjsRes = await db.query<SuratJalan>("surat_jalan", {
      orderBy: { column: "dibuat_pada", ascending: false },
      limit,
    });
    const sjs = sjsRes.data || [];
    if (sjs.length === 0) return [];

    const sjIds = sjs.map((s) => s.id);
    const penjualanIds = sjs.map((s) => s.penjualan_id).filter(Boolean) as string[];
    const userIds = sjs.map((s) => s.dibuat_oleh).filter(Boolean) as string[];

    const [itemsBySj, penjualanMap, userMap] = await Promise.all([
      fetchChildrenByForeignKey<SuratJalanItem>("item_surat_jalan", "surat_jalan_id", sjIds),
      buildLookupMap<{ nomor_faktur: string }>("penjualan", penjualanIds, "nomor_faktur"),
      buildLookupMap<{ nama_lengkap?: string; nama_pengguna?: string }>(
        "profil",
        userIds,
        "nama_lengkap,nama_pengguna"
      ),
    ]);

    return sjs.map((sj) => {
      const items = (itemsBySj.get(sj.id) || []).sort(
        (a, b) => (a.urutan ?? 0) - (b.urutan ?? 0)
      );
      const penjualan = sj.penjualan_id ? penjualanMap.get(sj.penjualan_id) : null;
      const user = sj.dibuat_oleh ? userMap.get(sj.dibuat_oleh) : null;
      return {
        ...sj,
        items,
        nomor_faktur: penjualan?.nomor_faktur || null,
        dibuat_oleh_nama: user?.nama_lengkap || user?.nama_pengguna || null,
      };
    });
  } catch (error) {
    console.error("Error fetching surat jalan:", error);
    throw error;
  }
}
```

(The trailing `catch` shown replaces the existing one — do not duplicate it.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/__tests__/surat-jalan-service.test.ts -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/surat-jalan-service.ts src/lib/__tests__/surat-jalan-service.test.ts
git commit -m "perf(n+1): batch getSuratJalan SQLite fallback via enrich-utils"
```

---

### Task 8: Refactor `getProductionOrderById` (detail path)

**Files:**
- Modify: `src/lib/services/production-service.ts:311-378`
- Test: `src/lib/__tests__/production-customer-name.test.ts` is name-specific; create `src/lib/__tests__/production-order-detail.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/production-order-detail.test.ts`:

```ts
/**
 * getProductionOrderById: nested enrichment batched, no per-item N+1.
 */
import { resetMockDb, mockTable, __mock } from "./helpers/mock-db";

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

import { getProductionOrderById } from "../services/production-service";

beforeEach(() => resetMockDb());

describe("getProductionOrderById (no per-item N+1)", () => {
  it("enriches items with finishing, operator, saleItem, and consumption in batch", async () => {
    mockTable("order_produksi").set("op1", { id: "op1", penjualan_id: "s1" });
    mockTable("penjualan").set("s1", { id: "s1", nomor_faktur: "INV-1", pelanggan_id: "c1" });
    mockTable("pelanggan").set("c1", { id: "c1", nama: "Andi" });
    mockTable("profil").set("u1", { id: "u1", nama_pengguna: "operator1" });
    mockTable("item_produksi").set("ip1", {
      id: "ip1", order_produksi_id: "op1", item_penjualan_id: "si1",
      operator_id: "u1", dibuat_pada: "2026-05-25",
    });
    mockTable("item_penjualan").set("si1", { id: "si1", tipe_item: "MAKLON", barang_id: "b1" });
    mockTable("item_finishing").set("if1", {
      id: "if1", item_produksi_id: "ip1", operator_id: "u1", dibuat_pada: "2026-05-25",
    });
    mockTable("production_material_consumptions").set("pmc1", {
      id: "pmc1", item_produksi_id: "ip1", status: "POSTED",
    });

    const order = await getProductionOrderById("op1");
    expect(order).not.toBeNull();
    expect(order!.nomor_faktur).toBe("INV-1");
    expect(order!.items[0].operator_nama).toBe("operator1");
    expect(order!.items[0].is_maklon).toBe(true);
    expect(order!.items[0].finishing[0].operator_nama).toBe("operator1");
    expect(order!.items[0].consumption?.id).toBe("pmc1");
    // header (order+penjualan+pelanggan) uses 3 queryOne; items use batch queries.
    expect(__mock.db.queryOne.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/production-order-detail.test.ts -v`
Expected: FAIL — current code issues `queryOne` per item for operator/saleItem and per finishing for operator, exceeding 3.

- [ ] **Step 3: Implement the refactor**

In `src/lib/services/production-service.ts`, add after the existing imports:

```ts
import { buildLookupMap, fetchChildrenByForeignKey } from "./enrich-utils";
```

Replace the `itemsWithFinishing` block in `getProductionOrderById` (L311-378, from `const itemsWithFinishing = await Promise.all(` through its closing `);`) with:

```ts
    const itemIds = items.map((item) => item.id);
    const [
      finishingByItem,
      consumptionsByItem,
    ] = await Promise.all([
      fetchChildrenByForeignKey<FinishingItem>("item_finishing", "item_produksi_id", itemIds),
      fetchChildrenByForeignKey<any>("production_material_consumptions", "item_produksi_id", itemIds),
    ]);

    const finishingRows = [...finishingByItem.values()].flat();
    const operatorIds = [
      ...items.map((item) => item.operator_id),
      ...finishingRows.map((fin) => fin.operator_id),
    ].filter(Boolean) as string[];
    const saleItemIds = items.map((item) => item.item_penjualan_id).filter(Boolean) as string[];

    const [operatorMap, saleItemMap] = await Promise.all([
      buildLookupMap<{ nama_pengguna: string }>("profil", operatorIds, "nama_pengguna"),
      buildLookupMap<any>("item_penjualan", saleItemIds),
    ]);

    const itemsWithFinishing = items.map((item) => {
      const finishing = (finishingByItem.get(item.id) || []).map((fin) => ({
        ...fin,
        operator_nama: fin.operator_id
          ? operatorMap.get(fin.operator_id)?.nama_pengguna || undefined
          : undefined,
      }));

      const saleItem = item.item_penjualan_id
        ? saleItemMap.get(item.item_penjualan_id) || null
        : null;
      const consumption =
        (consumptionsByItem.get(item.id) || []).find((row: any) => row.status === "POSTED") ||
        null;

      return {
        ...item,
        is_maklon: saleItem?.tipe_item === "MAKLON",
        barang_id: (item as any).barang_id || saleItem?.barang_id || null,
        billed_panjang: (item as any).billed_panjang ?? saleItem?.billed_panjang ?? null,
        billed_lebar: (item as any).billed_lebar ?? saleItem?.billed_lebar ?? null,
        recommended_roll_width_m:
          (item as any).recommended_roll_width_m ??
          saleItem?.recommended_roll_width_m ??
          null,
        roll_inventory_status:
          (item as any).roll_inventory_status ||
          (saleItem?.roll_inventory_deferred ? "PENDING" : "NOT_REQUIRED"),
        operator_nama: item.operator_id
          ? operatorMap.get(item.operator_id)?.nama_pengguna || undefined
          : undefined,
        finishing,
        consumption,
      };
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/__tests__/production-order-detail.test.ts -v`
Expected: all PASS.

- [ ] **Step 5: Run the existing production tests to confirm no regression**

Run: `npx jest src/lib/__tests__/production-customer-name.test.ts src/lib/__tests__/production-consumption-void.test.ts -v`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/production-service.ts src/lib/__tests__/production-order-detail.test.ts
git commit -m "perf(n+1): batch getProductionOrderById nested enrichment via enrich-utils"
```

---

### Task 9: Retrofit `enrichQuotations` for cross-codebase consistency

**Files:**
- Modify: `src/lib/services/quotation-service.ts:82-111`
- Test: `src/lib/__tests__/quotation-service.test.ts` (append)

Rationale: the already-merged `enrichQuotations` fix uses fetch-all-`barang`-then-filter. Route it through `buildLookupMap` + `fetchChildrenByForeignKey` so every enrichment function in the codebase uses the identical helper pattern (requirement #2). `getPOSInitData`'s price grouping is a different shape (group-all-prices) and is intentionally left as-is — it already issues a single `harga_barang_satuan` query and does not do per-id lookups.

- [ ] **Step 1: Write the failing test (asserts helper-based batching)**

In `src/lib/__tests__/quotation-service.test.ts`, ensure `__mock` is imported from the helper, then append:

```ts
describe("getQuotations enrichment uses bounded queries (no N+1)", () => {
  it("does not call queryOne for barang lookups", async () => {
    const { resetMockDb, mockTable, __mock } = require("./helpers/mock-db");
    resetMockDb();
    mockTable("barang").set("b1", { id: "b1", nama: "Tinta" });
    mockTable("penawaran").set("q1", { id: "q1", dibuat_pada: "2026-05-25" });
    mockTable("item_penawaran").set("iq1", { id: "iq1", penawaran_id: "q1", barang_id: "b1" });

    __mock.db.query.mockClear();
    __mock.db.queryOne.mockClear();

    const { getQuotations } = require("../services/quotation-service");
    const quotes = await getQuotations();
    expect(quotes[0].items[0].barang_nama).toBe("Tinta");
    expect(__mock.db.queryOne).not.toHaveBeenCalled();
  });
});
```

If the test file already imports `getQuotations` and the mock at the top, use those imports instead of `require` and drop the inline `resetMockDb()` (a top-level `beforeEach(resetMockDb)` already exists).

- [ ] **Step 2: Run test to verify current behavior**

Run: `npx jest src/lib/__tests__/quotation-service.test.ts -t "no N+1" -v`
Expected: PASS already (current merged version uses `db.query`, not `queryOne`). This test locks in the no-`queryOne` guarantee before the refactor.

- [ ] **Step 3: Refactor to the shared helpers**

In `src/lib/services/quotation-service.ts`, add after the existing imports:

```ts
import { buildLookupMap, fetchChildrenByForeignKey } from "./enrich-utils";
```

Replace `enrichQuotations` (L82-111) with:

```ts
async function enrichQuotations(rows: any[]) {
  const quoteIds = rows.map((row) => row.id);
  const itemsByQuote = await fetchChildrenByForeignKey<any>(
    "item_penawaran",
    "penawaran_id",
    quoteIds
  );

  const barangIds = [...itemsByQuote.values()]
    .flat()
    .map((item) => item.barang_id)
    .filter(Boolean);
  const barangMap = await buildLookupMap<{ id: string; nama: string }>(
    "barang",
    barangIds,
    "nama"
  );

  return rows.map((row) => ({
    ...row,
    items: (itemsByQuote.get(row.id) || []).map((item) => ({
      ...item,
      barang_nama: barangMap.get(item.barang_id)?.nama || "",
    })),
  }));
}
```

- [ ] **Step 4: Run test to verify it still passes**

Run: `npx jest src/lib/__tests__/quotation-service.test.ts -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/quotation-service.ts src/lib/__tests__/quotation-service.test.ts
git commit -m "refactor(n+1): route enrichQuotations through shared enrich-utils helpers"
```

---

### Task 10: Harden the parity audit tool

**Files:**
- Modify: `scripts/audit-parity-sqlite.mjs` (`SYNC_TABLES` L34-87, `runtimeHasColumn` L167-175, the runtime-created-table branch L195-201)

Fixes (from code review): (a) `runtimeHasColumn` greps the whole runtime file, so a column name belonging to one table is falsely reported "ada di runtime" for every table — scope it; (b) the `SYNC_TABLES` list is hand-copied from `src/lib/db-sqlite.ts` and will rot — parse it from source; (c) runtime-created tables (`peran_pegawai`, `pegawai`) get no column-level check.

- [ ] **Step 1: Parse `SYNC_TABLES` from source instead of hand-copying**

In `scripts/audit-parity-sqlite.mjs`, replace the entire hand-written `const SYNC_TABLES = [ ... ];` array (L34-87) with:

```js
// Daftar tabel pull diparse langsung dari src/lib/db-sqlite.ts (SYNC_V2_TABLES)
// agar tidak rot saat daftar sumber berubah.
const dbSqliteTs = readFileSync(join(root, "src/lib/db-sqlite.ts"), "utf8");
const syncBlockMatch = dbSqliteTs.match(
  /export const SYNC_V2_TABLES\s*=\s*\[([\s\S]*?)\]/
);
if (!syncBlockMatch) {
  throw new Error("Tidak bisa menemukan SYNC_V2_TABLES di src/lib/db-sqlite.ts");
}
const SYNC_TABLES = [...syncBlockMatch[1].matchAll(/["']([a-z_][a-z0-9_]*)["']/gi)].map(
  (m) => m[1]
);
if (SYNC_TABLES.length === 0) {
  throw new Error("SYNC_V2_TABLES terparse kosong — cek format db-sqlite.ts");
}
```

- [ ] **Step 2: Scope `runtimeHasColumn` to the table**

Replace `runtimeHasColumn` (L167-175) with a version that recognizes the three real runtime mechanisms: (1) the generic `SYNC_V2_TABLES` loop that adds the 6 V2 columns to every sync table, (2) a table-specific `ALTER TABLE <table> ADD COLUMN <col>`, and (3) a column present in the table's runtime `CREATE TABLE` block:

```js
// 6 kolom sync V2 ditambahkan ke SEMUA tabel di SYNC_V2_TABLES oleh loop generik
// di db-sqlite-migrations.ts (ensureServerSQLiteSyncV2Schema).
const V2_SYNC_COLUMNS = new Set([
  "updated_at_server",
  "updated_by_device",
  "change_version",
  "is_deleted",
  "deleted_at",
  "client_mutation_id",
]);

// Ambil isi blok CREATE TABLE <table> ( ... ) dari teks runtime (bila ada).
function runtimeCreateBlock(table) {
  const re = new RegExp(
    `CREATE TABLE(?: IF NOT EXISTS)?\\s+"?${table}"?\\s*\\(`,
    "i"
  );
  const m = re.exec(runtimeTs);
  if (!m) return null;
  return extractBody(runtimeTs, m.index);
}

// Apakah runtime menambah `col` ke `table` secara spesifik (bukan grep global)?
function runtimeHasColumn(table, col) {
  // (1) Kolom V2 generik untuk tabel yang ikut SYNC_V2_TABLES.
  if (V2_SYNC_COLUMNS.has(col) && SYNC_TABLES.includes(table)) return true;
  // (2) ALTER TABLE <table> ADD COLUMN <col> — di-scope ke nama tabel.
  const alterRe = new RegExp(
    `ALTER TABLE\\s+"?${table}"?\\s+ADD COLUMN[^\\n;]*\\b${col}\\b`,
    "i"
  );
  if (alterRe.test(runtimeTs)) return true;
  // (3) Kolom ada di blok CREATE TABLE <table> runtime.
  const block = runtimeCreateBlock(table);
  if (block && parseCols(block).has(col)) return true;
  return false;
}
```

- [ ] **Step 3: Give runtime-created tables a column-level check**

Replace the missing-table branch (currently L195-201, the `if (!lite) { ... continue; }` block) with one that, when the table is created by runtime, compares Postgres columns against the runtime CREATE block plus the generic V2 columns:

```js
  if (!lite) {
    const created = runtimeCreatesTable(t);
    missingTables.push(t);
    if (!created) {
      dangerous.push(`tabel ${t}`);
      console.log(`[TABEL HILANG di sqlite-schema] ${t} (runtime creates? false)`);
      continue;
    }
    // Tabel dibuat runtime — periksa kolomnya juga (jangan buta).
    const block = runtimeCreateBlock(t);
    const runtimeCols = block ? parseCols(block) : new Set();
    if (SYNC_TABLES.includes(t)) {
      for (const c of V2_SYNC_COLUMNS) runtimeCols.add(c);
    }
    const missingInRuntime = [...pg].filter((c) => !runtimeCols.has(c));
    if (missingInRuntime.length) {
      for (const c of missingInRuntime) dangerous.push(`${t}.${c}`);
      console.log(
        `[TABEL HILANG di sqlite-schema] ${t} (runtime creates? true) — kolom tak terbangun: ${missingInRuntime.join(", ")}`
      );
    } else {
      console.log(`[TABEL HILANG di sqlite-schema] ${t} (runtime creates? true, kolom lengkap)`);
    }
    continue;
  }
```

- [ ] **Step 4: Run the audit and confirm it still exits 0 (AMAN)**

Run: `node scripts/audit-parity-sqlite.mjs; echo "EXIT=$?"`
Expected: ends with `✅ AMAN — semua sisa drift template dikompensasi runtime migrations.` and `EXIT=0`.

- [ ] **Step 5: Sanity-check the scoping fix with a deliberate probe (manual, then revert)**

Temporarily edit the audit to call `runtimeHasColumn("pengaturan_toko", "barang_id")` near the top and `console.log` it.
Run: `node scripts/audit-parity-sqlite.mjs`
Expected: prints `false` (a `barang_id` ALTER exists for other tables, but not for `pengaturan_toko`) — proving the global-grep false-positive is gone.
Revert the probe before committing.

- [ ] **Step 6: Commit**

```bash
git add scripts/audit-parity-sqlite.mjs
git commit -m "fix(audit): scope runtimeHasColumn per-table, parse SYNC_TABLES from source, check runtime-created tables"
```

---

### Task 11: Full-suite verification gate

**Files:** none (verification only)

- [ ] **Step 1: Type-check**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 2: Run the full Jest suite**

Run: `npx jest`
Expected: all suites pass (existing + new: db-unified, enrich-utils, stock-opname, purchase-order, purchases-queries, return-service, surat-jalan, production-order-detail, quotation).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build completes, all routes prerender, 0 errors.

- [ ] **Step 4: Rebuild SQLite template + audit (parity unaffected, sanity)**

Run: `npm run db:build-template`
Expected: `Wrote .../database/gemiprint.db`.
Run: `node scripts/audit-parity-sqlite.mjs; echo "EXIT=$?"`
Expected: `EXIT=0`.

- [ ] **Step 5: Final commit (only if any verification fix was needed)**

If steps 1–4 required a fix, commit it:

```bash
git add -A
git commit -m "chore: verification fixes for n+1 batching + audit hardening"
```

Otherwise no commit — the work is already committed task-by-task.

---

## Self-Review

**1. Spec coverage (user requirements):**
- **"fix all routes"** — Tasks 3–8 cover every flagged N+1 path: `enrichSessions`, `enrichPurchaseOrders`, `enrichPurchaseRows`, `getDebts`, `enrichReturns`, `getSuratJalan` (SQLite fallback), `getProductionOrderById`. Already-merged paths (`getPOSInitData`, `enrichQuotations`, `summary-v2`, `getProductionOrders`, `getSales`) are accounted for; `enrichQuotations` is retrofitted in Task 9 for consistency. ✓
- **"make it consistent"** — Task 1 adds one mechanism (array `where` → IN); Task 2 wraps it in `buildLookupMap` / `fetchChildrenByForeignKey`; every route in Tasks 3–9 uses the same two helpers. ✓
- **"do what you need regarding the audit"** — Task 10 fixes all three reviewer findings (scoped `runtimeHasColumn`, parsed `SYNC_TABLES`, runtime-created-table column check). ✓
- **"English"** — plan + new comments use English where they are new; existing Indonesian domain comments are preserved per the project language rule (Bahasa for app-owned artifacts), new helper docs kept concise. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases". Every code step shows complete code; every test step shows full test bodies; every run step shows the exact command and expected result. ✓

**3. Type consistency:** `buildLookupMap(table, ids, select?) → Map<string, T>` and `fetchChildrenByForeignKey(table, fkColumn, parentIds) → Map<string, T[]>` are used with those exact signatures in Tasks 3–9. `buildLookupMap` returns full rows (callers read `.nama`, `.nama_perusahaan`, `.nama_pengguna`, `.nama_lengkap`, `.nomor_faktur`) — consistent everywhere, including the `getDebts` fix that changes `vendorMap.get(id)` from a string to `.nama_perusahaan`. ✓

**Note on risk:** `buildLookupMap` and `fetchChildrenByForeignKey` issue `WHERE id IN (...)` / `WHERE fk IN (...)`. On Supabase this is one PostgREST round-trip; the `.in()` URL stays small for master tables at realistic page sizes (≤200 parents). If a future caller passes thousands of ids, chunking can be added inside the helper without touching call sites — out of scope here.
