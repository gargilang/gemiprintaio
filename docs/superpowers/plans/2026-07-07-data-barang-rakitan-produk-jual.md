# Sub-project B: Data Barang — Rakitan per Produk Jual, HPP BOM, Satuan Default — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empat perubahan Data Barang — (B1) default satuan dasar saat tambah produk jual, (B2) rakitan BOM per produk jual + HPP termasuk biaya BOM saat jual, (B3) drop field "Jumlah roll" di UI BOM komponen berdimensi. B4 (SPK otomatis pakai BOM per produk jual) adalah konsekuensi B2 — tidak ada perubahan kode SPK.

**Architecture:** Section 1 (schema): tambah kolom `unit_price_id` nullable di `barang_komponen` (FK ke `harga_barang_satuan`, ON DELETE CASCADE) + `jumlah_roll` jadi `NOT NULL DEFAULT 1`. Sync 3 tempat: migrasi Supabase, `database/sqlite-schema.sql`, runtime ALTER `db-unified.ts`. Section 2 (resolver & service): helper `resolveBomForUnitPrice` di service baru `bom-service.ts` (butuh `db`); `deductBomComponents` terima `unitPriceId` & pakai resolver; caller `updateProductionItemStatus` teruskan `unitPriceId` dari `item_penjualan.harga_satuan_id` lewat join. Section 3 (API): `KomponenSchema` + POST/GET terima & validasi `unit_price_id`; default `jumlah_roll = 1`. Section 4 (UI): `ModalTambahBarang.addUnitPrice` default `formData.base_unit`; `PanelKomponenRakitan` tambah dropdown "Berlaku untuk Produk Jual" + kolom tabel + props `unitPrices`; hide input "Jumlah roll". Section 5 (HPP): `createSaleAttempt` cabang BARANG tambah `bomCostPerUnit` dari resolver. Section 6: verifikasi.

**Tech Stack:** Next.js 15 (App Router, API routes), React 19, SWR (`useCachedData`), Supabase Postgres (server), SQLite (Tauri fallback), Zod, Jest (node + jsdom), Tailwind CSS, Bahasa Indonesia untuk UI/komentar.

**Catatan penting (pre-plan findings):**
- `item_produksi` **TIDAK punya** kolom `harga_satuan_id`. Punya `item_penjualan_id`. Untuk dapat produk jual saat SPK completion, plan ini join ke `item_penjualan` via `item_penjualan_id` lalu ambil `harga_satuan_id`.
- `barang_komponen` sudah terdaftar di `src/lib/sync-config.ts` (`MASTER_SYNC_TABLES`). Kolom baru otomatis tersinkron via sync dinamis — tidak perlu daftar ulang.
- File `src/lib/__tests__/bom-service.test.ts` **sudah ada** tapi isinya test `deductBomComponents` (bukan resolver). Resolver test ditulis di file baru `src/lib/__tests__/bom-resolver.test.ts` supaya tidak menimpa test existing.
- `bom-utils.ts` pure (tanpa `db`). Resolver butuh `db` → taruh di `src/lib/services/bom-service.ts` baru, bukan di `bom-utils.ts`.
- Tidak ada test `pos-mutations` existing — HPP BOM test ditulis di file baru `src/lib/__tests__/pos-mutations-hpp-bom.test.ts`.

## Global Constraints

- Bahasa Indonesia untuk semua UI strings, komentar baru, pesan error. Framework/library terms boleh English.
- Schema change = 3 tempat sync: (a) `supabase/migrations/<timestamp>_<name>.sql` (additive, `IF NOT EXISTS`), (b) `database/sqlite-schema.sql`, (c) runtime ALTER idempoten di `src/lib/db-unified.ts`. Migrasi yang sudah di-cloud immutable — tulis migrasi baru.
- Mutating API route wajib auth guard (`requireAdminOrManager` untuk POST/DELETE; `requireSession` untuk GET). Tangkap `AuthGuardError` → return `.status`.
- Validasi input mutasi pakai Zod + `.passthrough()` + `safeParse` → 422. `z.coerce.number().finite()` untuk money/qty.
- Tidak boleh import `getSupabaseAdmin` dari client code.
- Pakai `db.query/queryOne/insert/update/delete` dari `src/lib/db-unified.ts` — jangan import client Supabase/SQLite langsung dari feature code.
- TDD untuk task yang melibatkan service/API helper (jest node project): tulis failing test dulu → run (FAIL) → implementasi → run (PASS).
- Error DB dilewatkan via `friendlyPgError(e, "barang_komponen")` — jangan throw raw PostgREST ke UI.
- Dark mode wajib: setiap color class butuh pasangan `dark:`.
- Icons: SVG components dari `src/components/icons/`, jangan emoji.
- N+1 di HPP BOM ditoleransi MVP (BOM biasanya 1-3 komponen, item per transaksi kecil) — tandai di komentar sebagai optimasi future.
- HPP BOM hanya untuk item BARANG (bukan MAKLON/JASA).
- **Cross-dependency sub-proyek C:** sub-proyek C juga mengubah `createSaleAttempt` (cabang MAKLON). Plan B selesai dulu sebelum plan C di-eksekusi, ATAU paralel asal tidak edit barus yang sama. Untuk amannya, plan B dieksekusi sebelum plan C.
- Verifikasi wajib sebelum "done": `npm run type-check` (0 error) → `npm run build` → `npx jest` untuk test terkait. Lint warning baru harus diperbaiki.

## File Structure

**Modify:**
- `supabase/migrations/20260707000002_barang_komponen_unit_price.sql` — create; tambah `unit_price_id` + FK + index + `jumlah_roll NOT NULL DEFAULT 1` + backfill NULL → 1.
- `database/sqlite-schema.sql` — tambah kolom `unit_price_id TEXT` di `barang_komponen`; ubah `jumlah_roll INTEGER` → `INTEGER NOT NULL DEFAULT 1`.
- `src/lib/db-unified.ts` — tambah runtime ALTER `unit_price_id` + set default `jumlah_roll` (di blok `ensureServerSyncQueueSchema` L1690-1713).
- `src/lib/services/production-service.ts` — `deductBomComponents` terima `unitPriceId` & pakai `resolveBomForUnitPrice`; caller `updateProductionItemStatus` (L1141-1162) teruskan `unitPriceId` lewat join `item_penjualan`.
- `src/app/api/barang-komponen/route.ts` — `KomponenSchema` tambah `unit_price_id`; POST simpan + validasi ownership; GET terima filter `?unit_price_id=` & return field; default `jumlah_roll = 1` untuk komponen berdimensi.
- `src/components/ModalTambahBarang.tsx` — `addUnitPrice` default `formData.base_unit`; lewat props `unitPrices` ke `PanelKomponenRakitan` (L922-930).
- `src/components/PanelKomponenRakitan.tsx` — tambah props `unitPrices`; dropdown "Berlaku untuk Produk Jual"; kolom tabel "Berlaku untuk"; hide input "Jumlah roll"; default internal `jumlahRoll = "1"`; label help "Lebar × Panjang (m) = m²/unit".

**Create:**
- `src/lib/services/bom-service.ts` — `resolveBomForUnitPrice(barangId, unitPriceId)`.
- `src/lib/__tests__/bom-resolver.test.ts` — test resolver (4 skenario).
- `src/lib/__tests__/bom-service.test.ts` — UPDATE: tambah test case untuk `deductBomComponents` dengan `unitPriceId` (file sudah ada, extend, jangan timpa test existing).
- `src/app/api/barang-komponen/__tests__/route.test.ts` — UPDATE: tambah test POST `unit_price_id` valid/invalid + GET filter.
- `src/lib/__tests__/pos-mutations-hpp-bom.test.ts` — test HPP BOM di `createSaleAttempt` cabang BARANG.
- `src/lib/__tests__/bom-utils.test.ts` — UPDATE: tambah case `hitungQtyKomponenDimensiM2` default `jumlahRoll = 1`.

---

### Task 1: Migrasi Supabase + SQLite schema + runtime ALTER (`unit_price_id` + `jumlah_roll DEFAULT 1`)

**Files:**
- Create: `supabase/migrations/20260707000002_barang_komponen_unit_price.sql`
- Modify: `database/sqlite-schema.sql` (definisi `barang_komponen` L65-87)
- Modify: `src/lib/db-unified.ts` (blok runtime ALTER `barang_komponen` L1690-1713)

**Interfaces:**
- Consumes: tabel `barang_komponen` dengan kolom `jumlah_roll INTEGER` (nullable) + tidak ada `unit_price_id`.
- Produces: kolom `unit_price_id TEXT` nullable (FK ke `harga_barang_satuan.id` ON DELETE CASCADE) + `jumlah_roll INTEGER NOT NULL DEFAULT 1`. Row existing `jumlah_roll = NULL` di-backfill ke 1.

- [ ] **Step 1: Cek isi `database/sqlite-schema.sql` untuk definisi `barang_komponen`**

Run: `grep -n "barang_komponen" database/sqlite-schema.sql`
Expected: menemukan `CREATE TABLE IF NOT EXISTS barang_komponen` di L65 dengan `jumlah_roll INTEGER` (nullable) dan belum ada `unit_price_id`.

- [ ] **Step 2: Buat migration Supabase**

Tulis file `supabase/migrations/20260707000002_barang_komponen_unit_price.sql`:

```sql
-- B2: scope BOM per produk jual + B3: default jumlah_roll = 1.
-- Kolom unit_price_id nullable: NULL = scope barang-level (backwards-compat),
-- non-NULL = scope eksklusif untuk produk jual itu. FK ON DELETE CASCADE supaya
-- hapus produk jual ikut hapus BOM yang scoped ke produk itu.
ALTER TABLE "public"."barang_komponen"
  ADD COLUMN IF NOT EXISTS "unit_price_id" "text";

ALTER TABLE "public"."barang_komponen"
  DROP CONSTRAINT IF EXISTS "barang_komponen_unit_price_id_fkey";
ALTER TABLE "public"."barang_komponen"
  ADD CONSTRAINT "barang_komponen_unit_price_id_fkey"
  FOREIGN KEY ("unit_price_id") REFERENCES "public"."harga_barang_satuan"("id")
  ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "barang_komponen_unit_price_id_idx"
  ON "public"."barang_komponen" ("unit_price_id")
  WHERE "is_deleted" = 0;

-- B3: jumlah_roll NOT NULL DEFAULT 1 (1 unit produk jual = 1 potong komponen,
-- bukan roll besar). Backfill NULL → 1 sebelum SET NOT NULL.
UPDATE "public"."barang_komponen"
  SET "jumlah_roll" = 1
  WHERE "jumlah_roll" IS NULL;

ALTER TABLE "public"."barang_komponen"
  ALTER COLUMN "jumlah_roll" SET DEFAULT 1;
ALTER TABLE "public"."barang_komponen"
  ALTER COLUMN "jumlah_roll" SET NOT NULL;
```

- [ ] **Step 3: Update `database/sqlite-schema.sql` — definisi `barang_komponen`**

Edit blok `CREATE TABLE IF NOT EXISTS barang_komponen` (L65-87). Tambah kolom `unit_price_id` + ubah `jumlah_roll`:

Sebelum (L69-73):
```sql
  qty                REAL NOT NULL DEFAULT 1,
  jumlah_roll        INTEGER,
  panjang            REAL,
  lebar              REAL,
  satuan             TEXT,
```

Sesudah:
```sql
  qty                REAL NOT NULL DEFAULT 1,
  jumlah_roll        INTEGER NOT NULL DEFAULT 1,
  panjang            REAL,
  lebar              REAL,
  satuan             TEXT,
  unit_price_id      TEXT REFERENCES harga_barang_satuan(id) ON DELETE CASCADE,
```

Tambah index baru di dekat `idx_barang_komponen_parent` (L89):
```sql
CREATE INDEX IF NOT EXISTS idx_barang_komponen_unit_price
  ON barang_komponen(parent_barang_id, unit_price_id);
```

- [ ] **Step 4: Tambah runtime ALTER idempoten di `src/lib/db-unified.ts`**

Di blok `// Migrasi: barang_komponen dimensi` (L1690-1713), setelah pengecekan `jumlah_roll`/`panjang`/`lebar`, tambah:

```ts
        if (!cols.includes("unit_price_id")) {
          db.exec(
            "ALTER TABLE barang_komponen ADD COLUMN unit_price_id TEXT REFERENCES harga_barang_satuan(id) ON DELETE CASCADE",
          );
        }
        // B3: backfill NULL → 1 + set default. SQLite tidak support SET DEFAULT
        // setelah ADD COLUMN dengan mudah; pakai UPDATE lalu andalkan DEFAULT
        // di sqlite-schema fresh-install. Row existing NULL → 1 di sini.
        try {
          db.exec(
            "UPDATE barang_komponen SET jumlah_roll = 1 WHERE jumlah_roll IS NULL",
          );
        } catch (_e) {
          // Toleransi: mungkin kolom belum ada di fresh install yang baru saja
          // dibuat dari sqlite-schema (kolom sudah NOT NULL DEFAULT 1).
        }
```

Catatan: `cols` di-refresh dari `PRAGMA table_info(barang_komponen)` — cek ulang kalau `unit_price_id` sudah ada sebelum ALTER (idempoten).

- [ ] **Step 5: Cek `src/lib/sync-config.ts` tidak perlu ubah**

Run: `grep -n "barang_komponen" src/lib/sync-config.ts`
Expected: ada entry `"barang_komponen"` di `MASTER_SYNC_TABLES`. Kolom baru otomatis tersinkron via sync dinamis — tidak perlu daftar kolom eksplisit.

- [ ] **Step 6: Verifikasi type-check**

Run: `npm run type-check`
Expected: 0 error. (Belum ada kode TS yang pakai kolom baru — ini hanya DB schema.)

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260707000002_barang_komponen_unit_price.sql database/sqlite-schema.sql src/lib/db-unified.ts
git commit -m "feat(db): tambah kolom unit_price_id + default jumlah_roll=1 di barang_komponen"
```

---

### Task 2: Helper `resolveBomForUnitPrice` (TDD — service baru `bom-service.ts`)

**Files:**
- Create: `src/lib/services/bom-service.ts`
- Test: `src/lib/__tests__/bom-resolver.test.ts` (create — nama beda dari `bom-service.test.ts` existing supaya tidak konflik)

**Interfaces:**
- Consumes: tabel `barang_komponen` dengan kolom `unit_price_id` (Task 1).
- Produces: `resolveBomForUnitPrice(barangId, unitPriceId)` → `Promise<BarangKomponenRow[]>`. Aturan resolusi:
  1. Jika `unitPriceId` non-null & ada row dengan `unit_price_id = unitPriceId` → return row itu saja (exclusive scope).
  2. Jika tidak ada scope per-produk-jual → fallback ke `unit_price_id IS NULL` (scope barang-level, backwards-compat).
  3. `unitPriceId = null/undefined` → hanya cari scope barang-level.
  4. Keduanya tidak ada → return `[]`.

- [ ] **Step 1: Tulis failing test**

Buat file `src/lib/__tests__/bom-resolver.test.ts`:

```ts
// @jest-environment node
/**
 * Test resolver BOM per produk jual (B2.b).
 * Aturan: scope per-produk-jual menang kalau ada; fallback ke scope barang-level
 * (unit_price_id NULL) kalau scope per-produk-jual kosong.
 */
const mockQuery = jest.fn();

jest.mock("@/lib/db-unified", () => ({
  db: { query: mockQuery },
}));

import { resolveBomForUnitPrice } from "@/lib/services/bom-service";

beforeEach(() => {
  mockQuery.mockReset();
});

describe("resolveBomForUnitPrice", () => {
  it("mengembalikan scope per-produk-jual jika ada row dengan unit_price_id cocok", async () => {
    mockQuery.mockResolvedValueOnce({
      data: [
        { id: "bk-1", komponen_id: "b-kaki", qty: 1, unit_price_id: "up-xbanner", is_deleted: 0 },
      ],
      error: null,
    });
    const rows = await resolveBomForUnitPrice("b-flexi", "up-xbanner");
    expect(rows).toHaveLength(1);
    expect(rows[0].komponen_id).toBe("b-kaki");
    // Hanya 1 kali query (scope per-produk-jual) — tidak fallback.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("fallback ke scope barang-level jika scope per-produk-jual kosong", async () => {
    mockQuery
      .mockResolvedValueOnce({ data: [], error: null }) // scope per-produk-jual kosong
      .mockResolvedValueOnce({
        data: [
          { id: "bk-2", komponen_id: "b-umum", qty: 1, unit_price_id: null, is_deleted: 0 },
        ],
        error: null,
      });
    const rows = await resolveBomForUnitPrice("b-flexi", "up-outdoor");
    expect(rows).toHaveLength(1);
    expect(rows[0].komponen_id).toBe("b-umum");
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("unitPriceId null hanya cari scope barang-level", async () => {
    mockQuery.mockResolvedValueOnce({
      data: [{ id: "bk-3", komponen_id: "b-umum", qty: 2, unit_price_id: null, is_deleted: 0 }],
      error: null,
    });
    const rows = await resolveBomForUnitPrice("b-flexi", null);
    expect(rows).toHaveLength(1);
    // Tidak coba scope per-produk-jual kalau unitPriceId null.
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(
      "barang_komponen",
      expect.objectContaining({
        where: expect.objectContaining({ parent_barang_id: "b-flexi", unit_price_id: null }),
      }),
    );
  });

  it("mengembalikan [] jika tidak ada scope per-produk-jual maupun barang-level", async () => {
    mockQuery
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const rows = await resolveBomForUnitPrice("b-flexi", "up-indoor");
    expect(rows).toEqual([]);
  });

  it("tolerasi error query — return [] (BOM partial lebih baik daripada gagal)", async () => {
    mockQuery.mockResolvedValueOnce({ data: null, error: new Error("conn down") });
    const rows = await resolveBomForUnitPrice("b-flexi", null);
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verifikasi FAIL**

Run: `npx jest src/lib/__tests__/bom-resolver.test.ts`
Expected: FAIL. Import `resolveBomForUnitPrice` gagal karena `src/lib/services/bom-service.ts` belum dibuat.

- [ ] **Step 3: Implementasi `src/lib/services/bom-service.ts`**

```ts
/** Service BOM (Bill of Materials) rakitan barang. */
import { db } from "@/lib/db-unified";

export interface BarangKomponenRow {
  id: string;
  parent_barang_id: string;
  komponen_id: string;
  qty: number;
  jumlah_roll?: number | null;
  panjang?: number | null;
  lebar?: number | null;
  satuan?: string | null;
  catatan?: string | null;
  unit_price_id?: string | null;
  is_deleted?: number;
}

/**
 * Resolusi BOM per produk jual (B2.b).
 *
 * 1. Jika unitPriceId non-null & ada row dengan unit_price_id cocok → pakai row
 *    itu saja (exclusive scope per produk jual).
 * 2. Jika tidak ada scope per-produk-jual → fallback ke scope barang-level
 *    (unit_price_id NULL) — backwards-compat untuk data existing.
 * 3. unitPriceId null/undefined → hanya cari scope barang-level.
 * 4. Keduanya tidak ada → return [].
 *
 * Catatan: query error ditoleransi (return []) supaya flow produksi/penjualan
 * tidak gagal total karena BOM hilang. Logging dilakukan oleh pemanggil.
 */
export async function resolveBomForUnitPrice(
  barangId: string,
  unitPriceId: string | null | undefined,
): Promise<BarangKomponenRow[]> {
  // 1. Coba scope per-produk-jual.
  if (unitPriceId) {
    try {
      const scoped = await db.query<BarangKomponenRow>("barang_komponen", {
        where: {
          parent_barang_id: barangId,
          unit_price_id: unitPriceId,
          is_deleted: 0,
        },
      });
      if (scoped.data && scoped.data.length > 0) return scoped.data;
    } catch (e) {
      console.warn(`[BOM] Gagal query scope per-produk-jual (${barangId}/${unitPriceId}):`, e);
    }
  }

  // 2. Fallback ke scope barang-level.
  try {
    const general = await db.query<BarangKomponenRow>("barang_komponen", {
      where: {
        parent_barang_id: barangId,
        unit_price_id: null,
        is_deleted: 0,
      },
    });
    return general.data || [];
  } catch (e) {
    console.warn(`[BOM] Gagal query scope barang-level (${barangId}):`, e);
    return [];
  }
}
```

- [ ] **Step 4: Run test, verifikasi PASS**

Run: `npx jest src/lib/__tests__/bom-resolver.test.ts`
Expected: PASS, 5 test lulus.

- [ ] **Step 5: Run type-check**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/bom-service.ts src/lib/__tests__/bom-resolver.test.ts
git commit -m "feat(bom): tambah resolveBomForUnitPrice (scope per produk jual + fallback barang-level)"
```

---

### Task 3: B1 — `addUnitPrice` default satuan dasar

**Files:**
- Modify: `src/components/ModalTambahBarang.tsx` (`addUnitPrice` L255-268)

**Interfaces:**
- Consumes: `formData.base_unit` (selalu terisi saat init modal — punya default).
- Produces: produk jual kedua dst. auto-isi `nama_satuan = formData.base_unit` (satuan dasar barang induk).

- [ ] **Step 1: Edit `addUnitPrice`**

Sebelum (L255-268):
```ts
  const addUnitPrice = () => {
    const refUnit = getReferensiUnitPrice(unitPrices);

    setUnitPrices([
      ...unitPrices,
      {
        nama_satuan: "",
        faktor_konversi: 1,
        harga_beli: refUnit?.harga_beli || 0,
        harga_jual: refUnit?.harga_jual || 0,
        harga_member: refUnit?.harga_member || 0,
      },
    ]);
  };
```

Sesudah:
```ts
  const addUnitPrice = () => {
    const refUnit = getReferensiUnitPrice(unitPrices);

    setUnitPrices([
      ...unitPrices,
      {
        // B1: default satuan dasar barang induk supaya produk jual kedua dst.
        // tidak kosong. fallback "" kalau base_unit belum terisi (kasus edge).
        nama_satuan: formData.base_unit || "",
        faktor_konversi: 1,
        harga_beli: refUnit?.harga_beli || 0,
        harga_jual: refUnit?.harga_jual || 0,
        harga_member: refUnit?.harga_member || 0,
      },
    ]);
  };
```

- [ ] **Step 2: Verifikasi type-check + build**

Run: `npm run type-check && npm run build`
Expected: 0 error. (Perubahan UI-only, tidak ada test jest yang relevan.)

- [ ] **Step 3: Commit**

```bash
git add src/components/ModalTambahBarang.tsx
git commit -m "feat(barang): default nama_satuan produk jual baru = satuan dasar induk (B1)"
```

---

### Task 4: B2 API — `KomponenSchema` + POST/GET `unit_price_id` + default `jumlah_roll` (TDD)

**Files:**
- Modify: `src/app/api/barang-komponen/route.ts` (L12-23 schema, L25-79 validate, L82-125 GET, L128-175 POST)
- Test: `src/app/api/barang-komponen/__tests__/route.test.ts` (extend, jangan timpa test existing)

**Interfaces:**
- Consumes: `KomponenSchema` existing (L12-23); `validateKomponenDimensi` (L25-79); GET/POST existing.
- Produces:
  - `KomponenSchema` tambah `unit_price_id: z.string().min(1).optional().nullable()`.
  - POST: simpan `unit_price_id` (null = scope barang-level). Validasi: jika `unit_price_id` diisi, pastikan `harga_barang_satuan.id` ada & `barang_id = parent_barang_id` — kalau mismatch → 422 "Produk jual tidak milik barang ini".
  - POST: jika komponen berdimensi & `jumlah_roll` tidak di-supply → default 1 (B3).
  - GET: terima query `?unit_price_id=xxx` untuk filter; return field `unit_price_id` di response.

- [ ] **Step 1: Tulis failing test (extend file existing)**

Tambah ke `src/app/api/barang-komponen/__tests__/route.test.ts` (jangan hapus test existing):

```ts
// Reset mock query agar bisa return data untuk test baru.
import { db as dbMock } from "@/lib/db-unified";
const dbQuery = dbMock.query as jest.MockedFunction<typeof dbMock.query>;
const dbQueryOne = dbMock.queryOne as jest.MockedFunction<typeof dbMock.queryOne>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/barang-komponen — unit_price_id (B2)", () => {
  it("menerima unit_price_id valid (milik parent barang) → 201", async () => {
    // komponen non-dimensi + harga_barang_satuan milik parent.
    dbQueryOne.mockResolvedValueOnce({
      data: { id: "k1", butuh_dimensi_status: 0, satuan_dasar: "pcs" },
      error: null,
    } as any);
    dbQueryOne.mockResolvedValueOnce({
      data: { id: "up-1", barang_id: "p1" },
      error: null,
    } as any);
    (dbMock.insert as jest.Mock).mockResolvedValueOnce({ data: { id: "new-id" }, error: null });

    const req = new NextRequest("http://localhost/api/barang-komponen", {
      method: "POST",
      body: JSON.stringify({
        parent_barang_id: "p1",
        komponen_id: "k1",
        qty: 2,
        unit_price_id: "up-1",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(dbMock.insert).toHaveBeenCalledWith(
      "barang_komponen",
      expect.objectContaining({ unit_price_id: "up-1" }),
    );
  });

  it("menolak unit_price_id yang tidak milik parent_barang_id → 422", async () => {
    dbQueryOne.mockResolvedValueOnce({
      data: { id: "k1", butuh_dimensi_status: 0, satuan_dasar: "pcs" },
      error: null,
    } as any);
    // harga_barang_satuan milik barang lain.
    dbQueryOne.mockResolvedValueOnce({
      data: { id: "up-2", barang_id: "p-other" },
      error: null,
    } as any);

    const req = new NextRequest("http://localhost/api/barang-komponen", {
      method: "POST",
      body: JSON.stringify({
        parent_barang_id: "p1",
        komponen_id: "k1",
        qty: 2,
        unit_price_id: "up-2",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/tidak milik barang/i);
  });

  it("default jumlah_roll = 1 untuk komponen berdimensi tanpa jumlah_roll (B3)", async () => {
    dbQueryOne.mockResolvedValueOnce({
      data: { id: "kdim", butuh_dimensi_status: 1, satuan_dasar: "m²" },
      error: null,
    } as any);
    (dbMock.insert as jest.Mock).mockResolvedValueOnce({ data: { id: "new-id" }, error: null });

    const req = new NextRequest("http://localhost/api/barang-komponen", {
      method: "POST",
      body: JSON.stringify({
        parent_barang_id: "p1",
        komponen_id: "kdim",
        qty: 0.85, // 1 × 0.5 × 1.7
        lebar: 0.5,
        panjang: 1.7,
        // jumlah_roll sengaja tidak di-supply → default 1
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(dbMock.insert).toHaveBeenCalledWith(
      "barang_komponen",
      expect.objectContaining({ jumlah_roll: 1, lebar: 0.5, panjang: 1.7 }),
    );
  });
});

describe("GET /api/barang-komponen — filter unit_price_id (B2)", () => {
  it("mengirim query unit_price_id ke db.query", async () => {
    dbQuery.mockResolvedValueOnce({ data: [], error: null } as any);

    const req = new NextRequest(
      "http://localhost/api/barang-komponen?parent_barang_id=p1&unit_price_id=up-1",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(dbQuery).toHaveBeenCalledWith(
      "barang_komponen",
      expect.objectContaining({
        where: expect.objectContaining({ parent_barang_id: "p1", unit_price_id: "up-1" }),
      }),
    );
  });
});
```

Catatan: mock di `route.test.ts` existing memakai inline `jest.fn().mockResolvedValue(...)` yang tidak bisa di-reset per test. Step implementasi Step 3 perlu refactor mock jadi `jest.fn()` top-level + `beforeEach(jest.clearAllMocks)`. Pastikan test existing tetap pass setelah refactor.

- [ ] **Step 2: Run test, verifikasi FAIL**

Run: `npx jest src/app/api/barang-komponen/__tests__/route.test.ts`
Expected: FAIL. Test baru gagal karena `unit_price_id` belum di-handle di schema/POST/GET, dan `jumlah_roll` tidak default 1.

- [ ] **Step 3: Implementasi — update schema + POST + GET**

Edit `src/app/api/barang-komponen/route.ts`.

**3a. `KomponenSchema` (L12-23) — tambah `unit_price_id`:**

Sebelum:
```ts
const KomponenSchema = z
  .object({
    parent_barang_id: z.string().min(1),
    komponen_id: z.string().min(1),
    qty: z.coerce.number().finite().positive(),
    jumlah_roll: z.coerce.number().finite().int().min(1).optional().nullable(),
    panjang: z.coerce.number().finite().positive().optional().nullable(),
    lebar: z.coerce.number().finite().positive().optional().nullable(),
    satuan: z.string().optional().nullable(),
    catatan: z.string().optional().nullable(),
  })
  .passthrough();
```

Sesudah:
```ts
const KomponenSchema = z
  .object({
    parent_barang_id: z.string().min(1),
    komponen_id: z.string().min(1),
    qty: z.coerce.number().finite().positive(),
    jumlah_roll: z.coerce.number().finite().int().min(1).optional().nullable(),
    panjang: z.coerce.number().finite().positive().optional().nullable(),
    lebar: z.coerce.number().finite().positive().optional().nullable(),
    satuan: z.string().optional().nullable(),
    catatan: z.string().optional().nullable(),
    // B2: scope BOM per produk jual. null = berlaku untuk semua produk jual
    // (scope barang-level, backwards-compat). non-null = eksklusif untuk 1 produk jual.
    unit_price_id: z.string().min(1).optional().nullable(),
  })
  .passthrough();
```

**3b. `validateKomponenDimensi` (L36-54) — default `jumlah_roll = 1`:**

Sebelum:
```ts
    const rolls = data.jumlah_roll != null ? Number(data.jumlah_roll) : null;
    const panjang = data.panjang != null ? Number(data.panjang) : null;
    const lebar = data.lebar != null ? Number(data.lebar) : null;
    if (
      rolls == null ||
      panjang == null ||
      lebar == null ||
      rolls < 1 ||
      panjang <= 0 ||
      lebar <= 0
    ) {
      return {
        ok: false as const,
        status: 422,
        error:
          "Komponen berdimensi wajib diisi: jumlah roll, lebar (m), dan panjang (m).",
      };
    }
```

Sesudah:
```ts
    // B3: jumlah_roll default 1 (1 unit produk jual = 1 potong komponen).
    const rolls = data.jumlah_roll != null ? Number(data.jumlah_roll) : 1;
    const panjang = data.panjang != null ? Number(data.panjang) : null;
    const lebar = data.lebar != null ? Number(data.lebar) : null;
    if (
      panjang == null ||
      lebar == null ||
      rolls < 1 ||
      panjang <= 0 ||
      lebar <= 0
    ) {
      return {
        ok: false as const,
        status: 422,
        error:
          "Komponen berdimensi wajib diisi: lebar (m) dan panjang (m).",
      };
    }
```

**3c. POST (L141-164) — tambah validasi `unit_price_id` + simpan:**

Setelah `validateKomponenDimensi` (L141) dan sebelum `const now = getCurrentTimestamp();` (L146), tambah blok validasi:

```ts
    // B2: validasi unit_price_id milik parent_barang_id.
    let unitPriceId: string | null = null;
    if (data.unit_price_id) {
      const upRes = await db.queryOne<any>("harga_barang_satuan", {
        where: { id: data.unit_price_id },
      });
      if (upRes.error) throw upRes.error;
      if (!upRes.data || upRes.data.barang_id !== data.parent_barang_id) {
        return NextResponse.json(
          { error: "Produk jual tidak milik barang ini" },
          { status: 422 },
        );
      }
      unitPriceId = data.unit_price_id;
    }
```

Di `db.insert("barang_komponen", {...})` (L147-162), tambah field `unit_price_id` dan pastikan `jumlah_roll` pakai default 1 untuk berdimensi:

Sebelum:
```ts
      jumlah_roll: dimCheck.berdimensi ? data.jumlah_roll : null,
```

Sesudah:
```ts
      jumlah_roll: dimCheck.berdimensi
        ? (data.jumlah_roll != null ? Number(data.jumlah_roll) : 1)
        : null,
      unit_price_id: unitPriceId,
```

**3d. GET (L82-114) — terima filter `?unit_price_id=` & return field:**

Sebelum (L85-91):
```ts
    const parentId = req.nextUrl.searchParams.get("parent_barang_id");
    if (!parentId) {
      return NextResponse.json({ error: "parent_barang_id wajib diisi" }, { status: 400 });
    }
    const res = await db.query<any>("barang_komponen", {
      where: { parent_barang_id: parentId, is_deleted: 0 },
    });
```

Sesudah:
```ts
    const parentId = req.nextUrl.searchParams.get("parent_barang_id");
    if (!parentId) {
      return NextResponse.json({ error: "parent_barang_id wajib diisi" }, { status: 400 });
    }
    const unitPriceId = req.nextUrl.searchParams.get("unit_price_id");
    const where: Record<string, unknown> = {
      parent_barang_id: parentId,
      is_deleted: 0,
    };
    // B2: filter opsional per produk jual. null string ("") → scope barang-level.
    if (unitPriceId !== null) {
      where.unit_price_id = unitPriceId === "" ? null : unitPriceId;
    }
    const res = await db.query<any>("barang_komponen", { where });
```

Response mapping (L105-113) sudah pakai `...k` spread → field `unit_price_id` otomatis ikut. Tidak perlu ubah eksplisit.

**3e. Refactor mock di test file** agar test existing + test baru bisa coexist:

Ubah top mock jadi `jest.fn()` (tanpa `.mockResolvedValue` inline) + `beforeEach` set default. Pastikan 3 test existing (`GET 400`, `POST qty -1`, `POST same id`) tetap pass.

- [ ] **Step 4: Run test, verifikasi PASS**

Run: `npx jest src/app/api/barang-komponen/__tests__/route.test.ts`
Expected: PASS, semua test (existing + baru) lulus.

- [ ] **Step 5: Run type-check**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/barang-komponen/route.ts src/app/api/barang-komponen/__tests__/route.test.ts
git commit -m "feat(barang-komponen): API terima unit_price_id + default jumlah_roll=1 (B2/B3)"
```

---

### Task 5: B2 UI — `PanelKomponenRakitan` dropdown "Berlaku untuk Produk Jual" + kolom tabel + props `unitPrices`

**Files:**
- Modify: `src/components/PanelKomponenRakitan.tsx` (interface L10-35, state L37-69, handleTambah L132-185, render L209-370)
- Modify: `src/components/ModalTambahBarang.tsx` (render `PanelKomponenRakitan` L922-930 — lewat props `unitPrices`)

**Interfaces:**
- Consumes: `UnitPrice` type dari `src/components/barang/types-barang.ts` (`id?`, `nama_satuan`, `nama_produk_jual?`). `ModalTambahBarang` punya `unitPrices` state + `editData.unit_prices`.
- Produces: `PanelKomponenRakitan` props tambah `unitPrices: UnitPrice[]`. Dropdown "Berlaku untuk Produk Jual" (default "Semua Produk Jual" = `unit_price_id = null`). Kolom tabel "Berlaku untuk". State `selectedUnitPriceId: string` ("" = Semua).

- [ ] **Step 1: Update props `PanelKomponenRakitan`**

Sebelum (L10-35):
```ts
interface KomponenRow {
  id: string;
  komponen_id: string;
  komponen_nama: string;
  komponen_satuan: string;
  komponen_butuh_dimensi?: number;
  qty: number;
  jumlah_roll?: number | null;
  panjang?: number | null;
  lebar?: number | null;
  satuan: string | null;
  catatan: string | null;
}

interface BarangOption {
  id: string;
  nama: string;
  satuan_dasar: string;
  butuh_dimensi_status?: number;
}

interface Props {
  parentBarangId: string;
  /** Semua barang untuk pilih komponen — dikirim dari parent agar tidak double-fetch */
  allBarang: BarangOption[];
}
```

Sesudah:
```ts
interface KomponenRow {
  id: string;
  komponen_id: string;
  komponen_nama: string;
  komponen_satuan: string;
  komponen_butuh_dimensi?: number;
  qty: number;
  jumlah_roll?: number | null;
  panjang?: number | null;
  lebar?: number | null;
  satuan: string | null;
  catatan: string | null;
  /** B2: produk jual yang berlaku untuk komponen ini. null = semua produk jual. */
  unit_price_id?: string | null;
}

interface BarangOption {
  id: string;
  nama: string;
  satuan_dasar: string;
  butuh_dimensi_status?: number;
}

interface Props {
  parentBarangId: string;
  /** Semua barang untuk pilih komponen — dikirim dari parent agar tidak double-fetch */
  allBarang: BarangOption[];
  /** B2: produk jual (harga_barang_satuan) parent barang untuk pilih scope BOM. */
  unitPrices: UnitPrice[];
}
```

Import `UnitPrice` di atas file:
```ts
import type { UnitPrice } from "./barang/types-barang";
```

- [ ] **Step 2: Tambah state `selectedUnitPriceId`**

Sebelum (L43-47):
```ts
  const [selectedKomponenId, setSelectedKomponenId] = useState("");
  const [qty, setQty] = useState("1");
  const [jumlahRoll, setJumlahRoll] = useState("1");
  const [lebar, setLebar] = useState("");
  const [panjang, setPanjang] = useState("");
```

Sesudah:
```ts
  const [selectedKomponenId, setSelectedKomponenId] = useState("");
  const [qty, setQty] = useState("1");
  // B3: jumlah_roll hidden di UI, selalu 1 internal. Lihat Step 5 untuk hide input.
  const [jumlahRoll, setJumlahRoll] = useState("1");
  const [lebar, setLebar] = useState("");
  const [panjang, setPanjang] = useState("");
  // B2: scope produk jual. "" = Semua Produk Jual (unit_price_id null).
  const [selectedUnitPriceId, setSelectedUnitPriceId] = useState("");
```

- [ ] **Step 3: Update `handleTambah` — kirim `unit_price_id`**

Sebelum (L132-162):
```ts
  async function handleTambah() {
    if (!selectedKomponenId) return setError("Pilih barang komponen.");

    let payload: Record<string, unknown> = {
      parent_barang_id: parentBarangId,
      komponen_id: selectedKomponenId,
    };

    if (komponenBerdimensi) {
      const rolls = Math.max(1, Math.round(parseFloat(jumlahRoll) || 0));
      const lebarNum = parseFloat(lebar);
      const panjangNum = parseFloat(panjang);
      if (!lebarNum || lebarNum <= 0 || !panjangNum || panjangNum <= 0) {
        return setError("Lebar dan panjang harus diisi (meter) untuk barang berdimensi.");
      }
      const qtyM2 = hitungQtyKomponenDimensiM2(rolls, panjangNum, lebarNum);
      if (qtyM2 <= 0) {
        return setError("Luas komponen tidak valid.");
      }
      payload = {
        ...payload,
        qty: qtyM2,
        jumlah_roll: rolls,
        lebar: lebarNum,
        panjang: panjangNum,
      };
    } else {
      const qtyNum = parseFloat(qty);
      if (!qtyNum || qtyNum <= 0) return setError("Qty harus lebih dari 0.");
      payload = { ...payload, qty: qtyNum };
    }
```

Sesudah:
```ts
  async function handleTambah() {
    if (!selectedKomponenId) return setError("Pilih barang komponen.");

    let payload: Record<string, unknown> = {
      parent_barang_id: parentBarangId,
      komponen_id: selectedKomponenId,
      // B2: scope per produk jual. "" = Semua (unit_price_id null).
      unit_price_id: selectedUnitPriceId || null,
    };

    if (komponenBerdimensi) {
      // B3: jumlah_roll selalu 1 di UI BOM (1 potong per unit produk jual).
      const rolls = 1;
      const lebarNum = parseFloat(lebar);
      const panjangNum = parseFloat(panjang);
      if (!lebarNum || lebarNum <= 0 || !panjangNum || panjangNum <= 0) {
        return setError("Lebar dan panjang harus diisi (meter) untuk barang berdimensi.");
      }
      const qtyM2 = hitungQtyKomponenDimensiM2(rolls, panjangNum, lebarNum);
      if (qtyM2 <= 0) {
        return setError("Luas komponen tidak valid.");
      }
      payload = {
        ...payload,
        qty: qtyM2,
        jumlah_roll: rolls,
        lebar: lebarNum,
        panjang: panjangNum,
      };
    } else {
      const qtyNum = parseFloat(qty);
      if (!qtyNum || qtyNum <= 0) return setError("Qty harus lebih dari 0.");
      payload = { ...payload, qty: qtyNum };
    }
```

Reset `selectedUnitPriceId` di akhir sukses (dekat L176-180):
```ts
      setSelectedKomponenId("");
      setQty("1");
      setJumlahRoll("1");
      setLebar("");
      setPanjang("");
      setSelectedUnitPriceId("");
      await reload();
```

- [ ] **Step 4: Tambah kolom tabel "Berlaku untuk"**

Di tabel (L228-265), tambah kolom antara "Satuan" dan kolom aksi. Helper untuk label:

Di atas `return` (dekat `renderQtyCell` L192), tambah:
```ts
  function labelUnitPrice(unitPriceId: string | null | undefined): string {
    if (!unitPriceId) return "Semua";
    const up = unitPrices.find((u) => u.id === unitPriceId);
    return up?.nama_produk_jual || up?.nama_satuan || "Produk jual";
  }
```

Tambah `<th>` di thead (setelah "Satuan" L237-239):
```tsx
                <th className="px-3 py-2.5 text-left font-medium text-slate-700 dark:text-slate-300">
                  Berlaku untuk
                </th>
```

Tambah `<td>` di tbody (setelah sel Satuan L248-250):
```tsx
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-base">
                      {labelUnitPrice(r.unit_price_id)}
                    </span>
                  </td>
```

- [ ] **Step 5: Hide input "Jumlah roll" + tambah dropdown "Berlaku untuk Produk Jual"**

Di blok input berdimensi (L288-331), hapus `<div className="w-20">` yang berisi input "Jumlah roll" (L290-302). Ganti dengan dropdown "Berlaku untuk" yang diletakkan di luar blok `komponenBerdimensi ?` (berlaku untuk kedua kasus).

Letakkan dropdown "Berlaku untuk Produk Jual" di baris form (dekat L268-286), sebelum `<select>` barang komponen atau setelahnya. Usulan: taruh setelah select barang komponen, sebelum blok berdimensi:

Sebelum blok `<>` berdimensi (L288):
```tsx
          <div className="min-w-[160px]">
            <label className="block text-base font-medium text-slate-600 dark:text-slate-400 mb-1">
              Berlaku untuk
            </label>
            <select
              value={selectedUnitPriceId}
              onChange={(e) => setSelectedUnitPriceId(e.target.value)}
              className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-base px-2 py-1.5"
            >
              <option value="">Semua Produk Jual</option>
              {unitPrices.map((up) => (
                <option key={up.id} value={up.id}>
                  {up.nama_produk_jual || up.nama_satuan}
                </option>
              ))}
            </select>
          </div>
```

Hapus input "Jumlah roll" di L290-302 (seluruh `<div className="w-20">`).

- [ ] **Step 6: Update label help "Lebar × Panjang = m²/unit"**

Sebelum (L358-368):
```tsx
        {komponenBerdimensi && lebar && panjang && (
          <p className="text-base text-blue-700 dark:text-blue-300">
            Per unit rakitan:{" "}
            {hitungQtyKomponenDimensiM2(
              Math.max(1, Math.round(parseFloat(jumlahRoll) || 1)),
              parseFloat(panjang) || 0,
              parseFloat(lebar) || 0
            ).toLocaleString("id-ID", { maximumFractionDigits: 4 })}{" "}
            m²
          </p>
        )}
```

Sesudah:
```tsx
        {komponenBerdimensi && lebar && panjang && (
          <p className="text-base text-blue-700 dark:text-blue-300">
            Lebar × Panjang (m) ={" "}
            {hitungQtyKomponenDimensiM2(
              1,
              parseFloat(panjang) || 0,
              parseFloat(lebar) || 0
            ).toLocaleString("id-ID", { maximumFractionDigits: 4 })}{" "}
            m² per unit produk jual
          </p>
        )}
```

Update juga deskripsi paragraf (L211-214) — hapus mention "jumlah roll":
```tsx
      <p className="text-base text-slate-500 dark:text-slate-400">
        Saat SPK barang ini diselesaikan, stok komponen di bawah akan berkurang otomatis.
        Barang berdimensi memakai input Lebar × Panjang (m) = m² per unit produk jual.
      </p>
```

- [ ] **Step 7: Lewat props `unitPrices` dari `ModalTambahBarang`**

Sebelum (L922-930):
```tsx
                <PanelKomponenRakitan
                  parentBarangId={editData.id}
                  allBarang={(materials || []).map((m: any) => ({
                    id: m.id,
                    nama: m.nama,
                    satuan_dasar: m.satuan_dasar || "",
                    butuh_dimensi_status: m.butuh_dimensi_status ?? 0,
                  }))}
                />
```

Sesudah:
```tsx
                <PanelKomponenRakitan
                  parentBarangId={editData.id}
                  allBarang={(materials || []).map((m: any) => ({
                    id: m.id,
                    nama: m.nama,
                    satuan_dasar: m.satuan_dasar || "",
                    butuh_dimensi_status: m.butuh_dimensi_status ?? 0,
                  }))}
                  unitPrices={unitPrices.map((up) => ({
                    id: up.id,
                    nama_satuan: up.nama_satuan,
                    nama_produk_jual: up.nama_produk_jual,
                  }))}
                />
```

Catatan: `unitPrices` di `ModalTambahBarang` adalah state yang sudah punya `id` untuk produk jual existing (saat edit). Saat tambah barang baru panel tidak render (hanya `editData?.id` ada), jadi aman.

- [ ] **Step 8: Verifikasi type-check + build**

Run: `npm run type-check && npm run build`
Expected: 0 error. UI-only, tidak ada jest yang relevan.

- [ ] **Step 9: Commit**

```bash
git add src/components/PanelKomponenRakitan.tsx src/components/ModalTambahBarang.tsx
git commit -m "feat(barang): PanelKomponenRakitan dropdown scope produk jual + hide jumlah_roll (B2/B3)"
```

---

### Task 6: B2 service — `deductBomComponents` terima `unitPriceId` + pakai resolver; caller teruskan via join (TDD)

**Files:**
- Modify: `src/lib/services/production-service.ts` (`deductBomComponents` L990-1048; caller `updateProductionItemStatus` L1141-1162)
- Test: `src/lib/__tests__/bom-service.test.ts` (extend — file existing test `deductBomComponents`)

**Interfaces:**
- Consumes: `resolveBomForUnitPrice` dari `bom-service.ts` (Task 2); `item_produksi.item_penjualan_id` + `item_penjualan.harga_satuan_id`.
- Produces: `deductBomComponents({ barangId, unitPriceId, qtySPK, spkId, ... })` pakai resolver per produk jual. Caller join `item_penjualan` untuk dapat `harga_satuan_id`.

- [ ] **Step 1: Tulis failing test (extend `bom-service.test.ts`)**

Tambah ke `src/lib/__tests__/bom-service.test.ts` (jangan hapus 4 test existing):

```ts
import { resolveBomForUnitPrice } from "@/lib/services/bom-service";

// Mock resolver supaya test deductBomComponents fokus pada logika potong stok,
// bukan pada query resolver (resolver sudah dites terpisah di bom-resolver.test.ts).
jest.mock("@/lib/services/bom-service", () => ({
  resolveBomForUnitPrice: jest.fn(),
}));
const mockResolveBom = resolveBomForUnitPrice as jest.MockedFunction<
  typeof resolveBomForUnitPrice
>;

describe("deductBomComponents — unitPriceId (B2)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPostInventoryMovement.mockResolvedValue({ id: "mov-1" });
  });

  it("memanggil resolveBomForUnitPrice dengan unitPriceId yang diberikan", async () => {
    mockResolveBom.mockResolvedValueOnce([
      { id: "bk-1", komponen_id: "b-kaki", qty: 1, is_deleted: 0 },
    ]);
    await deductBomComponents({
      barangId: "b-xbanner",
      unitPriceId: "up-xbanner",
      qtySPK: 2,
      spkId: "spk-001",
      nomorSpk: "SPK-001",
      dibuatOleh: "user-1",
      itemProduksiId: "item-1",
    });
    expect(mockResolveBom).toHaveBeenCalledWith("b-xbanner", "up-xbanner");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("unitPriceId null → resolver fallback ke scope barang-level", async () => {
    mockResolveBom.mockResolvedValueOnce([]);
    await deductBomComponents({
      barangId: "b-flexi",
      unitPriceId: null,
      qtySPK: 1,
      spkId: "spk-002",
      nomorSpk: "SPK-002",
      dibuatOleh: "user-1",
    });
    expect(mockResolveBom).toHaveBeenCalledWith("b-flexi", null);
    expect(mockPostInventoryMovement).not.toHaveBeenCalled();
  });

  it("resolver return [] → tidak memanggil postInventoryMovement", async () => {
    mockResolveBom.mockResolvedValueOnce([]);
    await deductBomComponents({
      barangId: "b-flexi",
      unitPriceId: "up-outdoor",
      qtySPK: 3,
      spkId: "spk-003",
      nomorSpk: "SPK-003",
      dibuatOleh: "user-1",
    });
    expect(mockPostInventoryMovement).not.toHaveBeenCalled();
  });
});
```

Catatan: test existing di file ini memakai `mockQuery.mockResolvedValue(...)` langsung (asumsi lama: `deductBomComponents` query langsung). Setelah implementasi Step 3, `deductBomComponents` memakai resolver (di-mock), bukan `db.query`. Update test existing supaya `mockResolveBom` return data yang sebelumnya di-set di `mockQuery`, atau pertahankan `mockQuery` sebagai fallback untuk kode lama yang mungkin masih dipanggil. Pastikan 4 test existing tetap pass (mungkin perlu set `mockResolveBom.mockResolvedValue(...)` dengan data yang sama).

- [ ] **Step 2: Run test, verifikasi FAIL**

Run: `npx jest src/lib/__tests__/bom-service.test.ts`
Expected: FAIL. `deductBomComponents` belum terima `unitPriceId` & belum pakai resolver.

- [ ] **Step 3: Implementasi `deductBomComponents`**

Edit `src/lib/services/production-service.ts` (L990-1048).

Sebelum:
```ts
export async function deductBomComponents({
  barangId,
  qtySPK,
  spkId,
  nomorSpk,
  dibuatOleh,
  itemProduksiId,
}: {
  barangId: string;
  qtySPK: number;
  spkId: string;
  nomorSpk: string;
  dibuatOleh: string;
  itemProduksiId?: string;
}): Promise<void> {
  const res = await db.query<any>("barang_komponen", {
    where: { parent_barang_id: barangId, is_deleted: 0 },
  });
  const komponen = res.data || [];
  if (komponen.length === 0) return;
```

Sesudah:
```ts
export async function deductBomComponents({
  barangId,
  unitPriceId,
  qtySPK,
  spkId,
  nomorSpk,
  dibuatOleh,
  itemProduksiId,
}: {
  barangId: string;
  /** B2: produk jual yang dipakai untuk resolusi BOM (null = scope barang-level). */
  unitPriceId?: string | null;
  qtySPK: number;
  spkId: string;
  nomorSpk: string;
  dibuatOleh: string;
  itemProduksiId?: string;
}): Promise<void> {
  const komponen = await resolveBomForUnitPrice(barangId, unitPriceId ?? null);
  if (komponen.length === 0) return;
```

Tambah import di atas file (dekat import `db`):
```ts
import { resolveBomForUnitPrice } from "@/lib/services/bom-service";
```

Sisa loop `for (const k of komponen)` tetap sama — `k` sekarang bertipe `BarangKomponenRow` dari resolver (sudah punya `qty`, `jumlah_roll`, `panjang`, `lebar`).

- [ ] **Step 4: Update caller `updateProductionItemStatus` (L1141-1162) — teruskan `unitPriceId` via join**

Sebelum:
```ts
    // BOM: potong stok komponen rakitan saat item baru diselesaikan
    if (data.status === "SELESAI" && cur.data?.status !== "SELESAI") {
      const itemFull = await db.queryOne<any>("item_produksi", {
        where: { id: itemId },
      });
      const barangId = itemFull.data?.barang_id;
      const qtySPK = Number(itemFull.data?.jumlah || 1);
      const orderId = itemFull.data?.order_produksi_id;
      if (barangId && orderId) {
        const orderData = await db.queryOne<any>("order_produksi", {
          where: { id: orderId },
        });
        const nomorSpk = String(orderData.data?.nomor_spk || orderId);
        await deductBomComponents({
          barangId,
          qtySPK,
          spkId: orderId,
          nomorSpk,
          dibuatOleh: data.operator_id || "system",
          itemProduksiId: itemId,
        });
      }
    }
```

Sesudah:
```ts
    // BOM: potong stok komponen rakitan saat item baru diselesaikan.
    // B2: scope BOM per produk jual. item_produksi tidak punya harga_satuan_id
    // langsung — join ke item_penjualan via item_penjualan_id untuk dapat produk jual.
    if (data.status === "SELESAI" && cur.data?.status !== "SELESAI") {
      const itemFull = await db.queryOne<any>("item_produksi", {
        where: { id: itemId },
      });
      const barangId = itemFull.data?.barang_id;
      const qtySPK = Number(itemFull.data?.jumlah || 1);
      const orderId = itemFull.data?.order_produksi_id;
      const itemPenjualanId = itemFull.data?.item_penjualan_id;
      if (barangId && orderId) {
        const orderData = await db.queryOne<any>("order_produksi", {
          where: { id: orderId },
        });
        const nomorSpk = String(orderData.data?.nomor_spk || orderId);
        // Ambil harga_satuan_id dari item_penjualan (produk jual yang dipesan).
        let unitPriceId: string | null = null;
        if (itemPenjualanId) {
          const ipRes = await db.queryOne<any>("item_penjualan", {
            where: { id: itemPenjualanId },
          });
          unitPriceId = ipRes.data?.harga_satuan_id ?? null;
        }
        await deductBomComponents({
          barangId,
          unitPriceId,
          qtySPK,
          spkId: orderId,
          nomorSpk,
          dibuatOleh: data.operator_id || "system",
          itemProduksiId: itemId,
        });
      }
    }
```

- [ ] **Step 5: Update test existing di `bom-service.test.ts` agar konsisten dengan mock resolver**

Test existing (4 test pertama) memakai `mockQuery.mockResolvedValue(...)`. Setelah implementasi, `deductBomComponents` memakai `resolveBomForUnitPrice` (di-mock), bukan `db.query`. Update 4 test existing: ganti `mockQuery.mockResolvedValue(...)` → `mockResolveBom.mockResolvedValue(...)` dengan data yang sama. Hapus `mockQuery` dari pemanggilan assertion yang sudah tidak relevan. Pastikan 4 test existing tetap lulus (verifikasi qty_delta, catatan, id movement tetap sama).

- [ ] **Step 6: Run test, verifikasi PASS**

Run: `npx jest src/lib/__tests__/bom-service.test.ts`
Expected: PASS, semua test (existing + 3 baru) lulus.

- [ ] **Step 7: Run semua test produksi untuk pastikan tidak regress**

Run: `npx jest src/lib/__tests__/production`
Expected: semua PASS.

- [ ] **Step 8: Run type-check**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 9: Commit**

```bash
git add src/lib/services/production-service.ts src/lib/__tests__/bom-service.test.ts
git commit -m "feat(produksi): deductBomComponents pakai resolver per produk jual (B2)"
```

---

### Task 7: B2 HPP — `createSaleAttempt` tambah BOM cost untuk BARANG items (TDD)

**Files:**
- Modify: `src/lib/services/pos-mutations.ts` (`createSaleAttempt` cabang BARANG L588-603)
- Test: `src/lib/__tests__/pos-mutations-hpp-bom.test.ts` (create)

**Interfaces:**
- Consumes: `resolveBomForUnitPrice` dari `bom-service.ts`; `fallbackAverageCostPerBaseUnit` (L80-101); `positiveNumber` helper.
- Produces: untuk item BARANG, `hppSatuan = baseHppSatuan + bomCostPerUnit` di mana `bomCostPerUnit = Σ(AVCO komponen × qty komponen per unit produk jual)`. Hanya BARANG (MAKLON/JASA tetap).

- [ ] **Step 1: Tulis failing test**

Buat file `src/lib/__tests__/pos-mutations-hpp-bom.test.ts`:

```ts
// @jest-environment node
/**
 * Test HPP BOM di createSaleAttempt cabang BARANG.
 * Verifikasi: hpp_satuan di item_penjualan = baseHpp + bomCostPerUnit.
 *
 * Karena createSaleAttempt besar & banyak dependensi, test ini mock semua
 * dependensi kecuali logika HPP BOM. Fokus: perhitungan bomCostPerUnit
 * dan total hppSatuan. Untuk MVP, test integrasi penuh tidak ditulis —
 * test ini mock resolveBomForUnitPrice + db.queryOne untuk verifikasi
 * rumus HPP BOM dipanggil dengan benar.
 */
const mockQuery = jest.fn();
const mockQueryOne = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();

jest.mock("@/lib/db-unified", () => ({
  db: {
    query: mockQuery,
    queryOne: mockQueryOne,
    insert: mockInsert,
    update: mockUpdate,
  },
  generateId: jest.fn(() => "mock-id"),
  getCurrentTimestamp: jest.fn(() => "2026-01-01T00:00:00Z"),
}));

const mockResolveBom = jest.fn();
jest.mock("@/lib/services/bom-service", () => ({
  resolveBomForUnitPrice: mockResolveBom,
}));

jest.mock("@/lib/services/inventory-service", () => ({
  postInventoryMovement: jest.fn().mockResolvedValue({ id: "mov-1" }),
  getRollVariants: jest.fn(),
}));

jest.mock("@/lib/services/shop-settings-service", () => ({
  getShopSettings: jest.fn().mockResolvedValue({}),
}));

import { createSale } from "@/lib/services/pos-mutations";

/**
 * Helper: setup mock agar createSaleAttempt bisa jalan sampai insert item_penjualan,
 * lalu tangkap payload item_penjualan untuk verifikasi hpp_satuan.
 */
function setupMocksForOneBarangItem(opts: {
  barangId: string;
  hargaSatuanId: string;
  jumlah: number;
  subtotal: number;
  faktor: number;
  averageCostPerBaseUnit: number;
  bomComponents: Array<{ komponen_id: string; qty: number }>;
  kompAvco: number; // AVCO seragam untuk semua komponen (test sederhana)
}) {
  // barang lookup
  mockQueryOne.mockImplementation(async (table: string) => {
    if (table === "barang") {
      return {
        data: {
          id: opts.barangId,
          average_cost_per_base_unit: opts.averageCostPerBaseUnit,
          butuh_dimensi_status: 0,
          satuan_dasar: "pcs",
        },
        error: null,
      };
    }
    if (table === "pelanggan") {
      return { data: { id: "c1", nama: "Pelanggan Test" }, error: null };
    }
    // komponen BOM lookup (bom-service resolver sudah di-mock, tapi logika HPP
    // loop komponen memanggil db.queryOne("barang", komponen_id) ulang)
    return { data: { id: "komp", average_cost_per_base_unit: opts.kompAvco }, error: null };
  });

  // harga_barang_satuan fallback (kalau averageCostPerBaseUnit 0)
  mockQuery.mockImplementation(async (table: string) => {
    if (table === "harga_barang_satuan") {
      return {
        data: [
          { id: opts.hargaSatuanId, faktor_konversi: 1, harga_beli: opts.averageCostPerBaseUnit },
        ],
        error: null,
      };
    }
    return { data: [], error: null };
  });

  mockResolveBom.mockResolvedValue(
    opts.bomComponents.map((b, i) => ({
      id: `bk-${i}`,
      komponen_id: b.komponen_id,
      qty: b.qty,
      is_deleted: 0,
    })),
  );

  mockInsert.mockImplementation(async (table: string, payload: any) => {
    if (table === "penjualan") return { data: { id: "sale-1", nomor_faktur: "FK-1" }, error: null };
    if (table === "item_penjualan") {
      (global as any).__lastItemPenjualan = payload;
      return { data: { id: "ip-1" }, error: null };
    }
    return { data: { id: "x" }, error: null };
  });

  mockUpdate.mockResolvedValue({ data: null, error: null });
}

describe("createSaleAttempt — HPP BOM (B2.f)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("hpp_satuan = baseHpp + bomCostPerUnit untuk item BARANG dengan BOM", async () => {
    const opts = {
      barangId: "b-xbanner",
      hargaSatuanId: "up-xbanner",
      jumlah: 2,
      subtotal: 100000,
      faktor: 1,
      averageCostPerBaseUnit: 5000, // baseHppSatuan = 5000 × 1 = 5000
      bomComponents: [
        { komponen_id: "b-kaki", qty: 1 }, // bomCost = 2000 × 1 = 2000
      ],
      kompAvco: 2000,
    };
    setupMocksForOneBarangItem(opts);

    await createSale({
      pelanggan_id: "c1",
      items: [
        {
          tipe_item: "BARANG",
          barang_id: opts.barangId,
          harga_satuan_id: opts.hargaSatuanId,
          nama_satuan: "pcs",
          faktor_konversi: opts.faktor,
          jumlah: opts.jumlah,
          subtotal: opts.subtotal,
          harga_jual: opts.subtotal / opts.jumlah,
        } as any,
      ],
      total: opts.subtotal,
      jumlah_dibayar: opts.subtotal,
      metode_pembayaran: "CASH",
      status_transaksi: "LUNAS",
    } as any);

    const ip = (global as any).__lastItemPenjualan;
    expect(ip).toBeDefined();
    // baseHpp (5000) + bomCost (2000) = 7000 per unit; total = 7000 × 2 = 14000
    expect(ip.hpp_satuan).toBeCloseTo(7000, 2);
    expect(ip.hpp_total).toBeCloseTo(14000, 2);
    expect(mockResolveBom).toHaveBeenCalledWith(opts.barangId, opts.hargaSatuanId);
  });

  it("hpp_satuan tanpa BOM (resolver return []) = baseHpp saja", async () => {
    const opts = {
      barangId: "b-plain",
      hargaSatuanId: "up-plain",
      jumlah: 1,
      subtotal: 50000,
      faktor: 1,
      averageCostPerBaseUnit: 3000,
      bomComponents: [],
      kompAvco: 0,
    };
    setupMocksForOneBarangItem(opts);

    await createSale({
      pelanggan_id: "c1",
      items: [
        {
          tipe_item: "BARANG",
          barang_id: opts.barangId,
          harga_satuan_id: opts.hargaSatuanId,
          nama_satuan: "pcs",
          faktor_konversi: opts.faktor,
          jumlah: opts.jumlah,
          subtotal: opts.subtotal,
          harga_jual: opts.subtotal,
        } as any,
      ],
      total: opts.subtotal,
      jumlah_dibayar: opts.subtotal,
      metode_pembayaran: "CASH",
      status_transaksi: "LUNAS",
    } as any);

    const ip = (global as any).__lastItemPenjualan;
    expect(ip.hpp_satuan).toBeCloseTo(3000, 2);
    expect(ip.hpp_total).toBeCloseTo(3000, 2);
  });

  it("MAKLON tidak memanggil resolveBomForUnitPrice", async () => {
    mockQueryOne.mockResolvedValue({ data: { id: "c1" }, error: null });
    mockInsert.mockImplementation(async (table: string) => {
      if (table === "penjualan") return { data: { id: "sale-1", nomor_faktur: "FK-1" }, error: null };
      if (table === "item_penjualan") {
        (global as any).__lastItemPenjualan = { hpp_satuan: 0, hpp_total: 10000, tipe_item: "MAKLON" };
        return { data: { id: "ip-1" }, error: null };
      }
      return { data: { id: "x" }, error: null };
    });
    mockUpdate.mockResolvedValue({ data: null, error: null });

    await createSale({
      pelanggan_id: "c1",
      items: [
        {
          tipe_item: "MAKLON",
          biaya_subkontrak: 10000,
          jumlah: 1,
          subtotal: 20000,
          nama_satuan: "pcs",
        } as any,
      ],
      total: 20000,
      jumlah_dibayar: 20000,
      metode_pembayaran: "CASH",
      status_transaksi: "LUNAS",
    } as any);

    expect(mockResolveBom).not.toHaveBeenCalled();
  });
});
```

Catatan: test ini mock berat karena `createSaleAttempt` punya banyak dependensi (NSFP, stock movement, SPK creation, dst.). Jika test terlalu rapuh karena mock mismatch, ubah strategi: ekstrak logika HPP BOM ke helper pure `computeBomCostPerUnit(barangId, unitPriceId)` di `bom-service.ts`, test helper secara terpisah, lalu `createSaleAttempt` cukup panggil helper. Pertimbangkan ekstraksi ini di Step 3 jika test integrasi sulit distabilkan.

- [ ] **Step 2: Run test, verifikasi FAIL**

Run: `npx jest src/lib/__tests__/pos-mutations-hpp-bom.test.ts`
Expected: FAIL. `hpp_satuan` belum termasuk BOM cost. `mockResolveBom` belum dipanggil di cabang BARANG.

- [ ] **Step 3: Implementasi HPP BOM di `createSaleAttempt`**

Edit `src/lib/services/pos-mutations.ts` (L588-603). Tambah import di atas file:
```ts
import { resolveBomForUnitPrice } from "@/lib/services/bom-service";
```

Sebelum:
```ts
        } else {
          const materialResult = await db.queryOne("barang", {
            where: { id: item.barang_id },
          });
          material = materialResult.data;
          const averageCostPerBaseUnit =
            positiveNumber(material?.average_cost_per_base_unit) ||
            (await fallbackAverageCostPerBaseUnit(
              item.barang_id,
              item.harga_satuan_id,
            ));
          hppSatuan =
            averageCostPerBaseUnit *
            (positiveNumber(item.faktor_konversi) || 1);
          hppTotal = hppSatuan * item.jumlah;
        }
```

Sesudah:
```ts
        } else {
          const materialResult = await db.queryOne("barang", {
            where: { id: item.barang_id },
          });
          material = materialResult.data;
          const averageCostPerBaseUnit =
            positiveNumber(material?.average_cost_per_base_unit) ||
            (await fallbackAverageCostPerBaseUnit(
              item.barang_id,
              item.harga_satuan_id,
            ));
          const baseHppSatuan =
            averageCostPerBaseUnit *
            (positiveNumber(item.faktor_konversi) || 1);

          // B2.f: tambah biaya BOM (komponen rakitan) per unit produk jual.
          // bomCostPerUnit = Σ(AVCO komponen × qty per unit produk jual).
          // k.qty sudah dalam satuan dasar komponen per unit produk jual (untuk
          // komponen berdimensi, k.qty = jumlah_roll × lebar × panjang = m²).
          // Catatan N+1: loop komponen per item bisa N+1. BOM biasanya kecil
          // (1-3 komponen) & item per transaksi kecil (~5-20), jadi ditoleransi
          // MVP. Optimasi future: batch-fetch AVCO semua komponen unik di awal
          // createSaleAttempt, simpan di Map.
          let bomCostPerUnit = 0;
          try {
            const bomComponents = await resolveBomForUnitPrice(
              item.barang_id,
              item.harga_satuan_id,
            );
            for (const k of bomComponents) {
              const kompRes = await db.queryOne<any>("barang", {
                where: { id: k.komponen_id },
              });
              const komp = kompRes.data;
              if (!komp) continue; // komponen hilang — skip, jangan gagal checkout
              const kompAvco =
                positiveNumber(komp.average_cost_per_base_unit) ||
                (await fallbackAverageCostPerBaseUnit(k.komponen_id, null));
              const perUnitQty = Number(k.qty) || 0;
              bomCostPerUnit += kompAvco * perUnitQty;
            }
          } catch (e) {
            console.warn(
              `[HPP BOM] Gagal hitung BOM untuk barang ${item.barang_id}:`,
              e,
            );
            // Toleransi: lanjut dengan bomCostPerUnit = 0 (BOM partial lebih
            // baik daripada gagal checkout — spec Error handling).
          }

          hppSatuan = baseHppSatuan + bomCostPerUnit;
          hppTotal = hppSatuan * item.jumlah;
        }
```

- [ ] **Step 4: Run test, verifikasi PASS**

Run: `npx jest src/lib/__tests__/pos-mutations-hpp-bom.test.ts`
Expected: PASS, 3 test lulus. Jika test integrasi terlalu rapuh (mock mismatch di banyak dependensi), pertimbangkan ekstraksi helper `computeBomCostPerUnit` di `bom-service.ts` + test helper murni — lalu `createSaleAttempt` panggil helper. Refactor itu tetap memenuhi spec.

- [ ] **Step 5: Run semua test pos untuk pastikan tidak regress**

Run: `npx jest src/lib/__tests__/schemas-pos src/lib/__tests__/pos-mutations`
Expected: semua PASS.

- [ ] **Step 6: Run type-check**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/pos-mutations.ts src/lib/__tests__/pos-mutations-hpp-bom.test.ts
git commit -m "feat(pos): HPP BARANG termasuk biaya BOM per produk jual (B2.f)"
```

---

### Task 8: B3 — hide `jumlah_roll` UI + default API + label help

**Catatan:** Sebagian besar B3 sudah diimplementasi di Task 4 (default API `jumlah_roll = 1`) dan Task 5 (hide input + label help di `PanelKomponenRakitan`). Task ini adalah verifikasi konsolidasi + tambah test `bom-utils` untuk default `jumlahRoll = 1`.

**Files:**
- Test: `src/lib/__tests__/bom-utils.test.ts` (extend)

- [ ] **Step 1: Tambah test `hitungQtyKomponenDimensiM2` default `jumlahRoll = 1`**

Tambah ke `src/lib/__tests__/bom-utils.test.ts`:

```ts
  test("hitungQtyKomponenDimensiM2 dengan jumlahRoll=1 (default BOM B3) = lebar × panjang", () => {
    // B3: 1 X Banner pakai 1 potong 0.5 × 1.7m = 0.85 m² per unit produk jual.
    expect(hitungQtyKomponenDimensiM2(1, 1.7, 0.5)).toBeCloseTo(0.85, 4);
  });
```

- [ ] **Step 2: Verifikasi hide input "Jumlah roll" di `PanelKomponenRakitan`**

Run: `grep -n "Jumlah roll" src/components/PanelKomponenRakitan.tsx`
Expected: tidak ada match (input sudah di-hide di Task 5 Step 5). Jika masih ada, hapus baris itu.

- [ ] **Step 3: Run test bom-utils**

Run: `npx jest src/lib/__tests__/bom-utils.test.ts`
Expected: PASS, semua test (existing + baru) lulus.

- [ ] **Step 4: Commit (jika ada perubahan)**

```bash
git add src/lib/__tests__/bom-utils.test.ts
git commit -m "test(bom): tambah case hitungQtyKomponenDimensiM2 default jumlahRoll=1 (B3)"
```

---

### Task 9: Verifikasi akhir + apply migration

**Files:** tidak ada — verifikasi end-to-end.

- [ ] **Step 1: Run type-check**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: build sukses, tidak ada error.

- [ ] **Step 3: Run semua test terkait**

Run: `npx jest src/lib/__tests__/bom-service.test.ts src/lib/__tests__/bom-resolver.test.ts src/lib/__tests__/bom-utils.test.ts src/app/api/barang-komponen/__tests__/route.test.ts src/lib/__tests__/pos-mutations-hpp-bom.test.ts`
Expected: semua PASS.

- [ ] **Step 4: Run lint di file yang diubah**

Run: `npx eslint src/lib/services/bom-service.ts src/lib/services/production-service.ts src/lib/services/pos-mutations.ts src/app/api/barang-komponen/route.ts src/components/PanelKomponenRakitan.tsx src/components/ModalTambahBarang.tsx src/lib/db-unified.ts`
Expected: tidak ada warning baru.

- [ ] **Step 5: Apply migrasi ke cloud (setelah push)**

Setelah semua commit di-push ke `main` (Vercel auto-deploy), jalankan:
```bash
npm run supabase:db:push
```
Expected: migrasi `20260707000002` ter-apply ke Supabase cloud (tambah `unit_price_id` + `jumlah_roll NOT NULL DEFAULT 1` + backfill). Verifikasi via Supabase dashboard atau `psql` bahwa kolom baru ada.

- [ ] **Step 6: Manual smoke test (opsional, oleh owner)**

1. Buat barang "Flexi Banner 280gsm" (roll, berdimensi), 3 produk jual (Outdoor, Indoor, X Banner).
2. Buat barang "Kaki Roll Banner" (pcs, non-dimensi).
3. Edit Flexi Banner → Komponen Rakitan → tambah Kaki Roll Banner qty=1, scope = "Standar X Banner Flexi" (pilih produk jual). Verifikasi: dropdown "Berlaku untuk" muncul, input "Jumlah roll" TIDAK muncul untuk komponen berdimensi.
4. Tambah produk jual kedua di Flexi Banner → verifikasi `nama_satuan` auto-isi satuan dasar (B1).
5. Jual 1 X Banner di POS → cek: HPP di struk/laporan termasuk biaya Kaki Roll Banner. Stok Kaki Roll belum berkurang (SPK belum selesai).
6. Selesaikan SPK X Banner → cek: stok Kaki Roll Banner berkurang 1.
7. Jual 1 Outdoor Flexi → cek: HPP TIDAK termasuk Kaki Roll (BOM scoped X Banner). SPK Outdoor selesai → Kaki Roll TIDAK berkurang.

- [ ] **Step 7: Commit final (jika ada fix dari verifikasi)**

```bash
git add -A
git commit -m "chore(verifikasi): sub-proyek B selesai — type-check + build + jest pass"
```

---

## Self-Review

**Coverage checklist:**
- [x] B1 — `addUnitPrice` default satuan dasar (Task 3).
- [x] B2.a Skema 3 tempat — migrasi Supabase + SQLite + runtime ALTER (Task 1).
- [x] B2.b Resolver `resolveBomForUnitPrice` + test (Task 2, TDD).
- [x] B2.c UI dropdown "Berlaku untuk Produk Jual" + kolom tabel + props (Task 5).
- [x] B2.d API `unit_price_id` schema + POST/GET + validasi ownership (Task 4, TDD).
- [x] B2.e Service `deductBomComponents` terima `unitPriceId` + caller join `item_penjualan` (Task 6, TDD).
- [x] B2.f HPP BOM di `createSaleAttempt` cabang BARANG (Task 7, TDD).
- [x] B2.g Tidak deduct stok di sale-time — sudah benar (stok di-potong di SPK completion, HPP di-sale-time = estimasi AVCO).
- [x] B3 Hide input "Jumlah roll" + default API + label help (Task 4 Step 3b, Task 5 Step 5/6, Task 8).
- [x] B4 SPK otomatis pakai BOM per produk jual — konsekuensi B2.e, tidak ada perubahan kode SPK UI.

**Iron rules dipatuhi:**
- Schema 3 tempat: Task 1 (migrasi + sqlite + runtime ALTER).
- Auth guard mutating endpoint: POST/DELETE sudah `requireAdminOrManager` (tidak diubah), GET `requireSession` (tidak diubah). Validasi `unit_price_id` baru tidak melewati guard (read-only check).
- Bahasa Indonesia: semua UI string, komentar, pesan error baru ("Produk jual tidak milik barang ini", "Berlaku untuk", "Semua Produk Jual", "Lebar × Panjang (m) = m² per unit produk jual").
- TDD: Task 2 (resolver), Task 4 (API), Task 6 (deductBomComponents), Task 7 (HPP BOM) — semua tulis test dulu.
- `db.query/queryOne/insert` dari `db-unified.ts` — tidak import Supabase/SQLite langsung.
- `friendlyPgError` sudah dipakai di route catch (tidak diubah).
- N+1 di HPP ditoleransi MVP + catatan komentar (Task 7 Step 3).
- HPP BOM hanya BARANG (Task 7 — guard `else` cabang, MAKLON/JASA tetap).
- Verifikasi: `npm run type-check` + `npm run build` + `npx jest` (Task 9).

**Catatan risiko & mitigasi:**
1. **`item_produksi` tidak punya `harga_satuan_id`** — mitigasi: caller join `item_penjualan` via `item_penjualan_id` (Task 6 Step 4). Tambahan 1 query per item SELESAI — dampak kecil (SPK completion jarang).
2. **Test `createSaleAttempt` integrasi rapuh** — `createSaleAttempt` punya banyak dependensi (NSFP, stock, SPK, period close). Jika test Task 7 sulit distabilkan, fallback: ekstrak `computeBomCostPerUnit` ke `bom-service.ts` sebagai helper pure-ish (butuh `db`), test helper secara terpisah, `createSaleAttempt` cukup panggil helper. Spec mengizinkan ini (B2.h "atau, jika butuh akses `db`, taruh di file service baru").
3. **Refactor mock di `route.test.ts`** — mock inline `jest.fn().mockResolvedValue(...)` tidak bisa di-reset per test. Refactor ke `jest.fn()` top-level + `beforeEach(jest.clearAllMocks)` diperlukan. Pastikan 3 test existing tetap pass.
4. **Cross-dependency sub-proyek C** — plan C mengubah `createSaleAttempt` cabang MAKLON; plan B mengubah cabang BARANG. Tidak conflict line-level. Eksekusi: plan B selesai dulu sebelum plan C (urutan), atau paralel asal tidak edit branch yang sama.
5. **FK ON DELETE CASCADE** — hapus produk jual (`harga_barang_satuan`) akan hapus BOM scoped ke produk itu. Ini sesuai spec (B2.a). Pastikan tidak ada row penting yang hilang tak sengaja — produk jual jarang dihapus di internal app.
6. **Backfill `jumlah_roll` NULL → 1** — migrasi Supabase UPDATE + runtime ALTER UPDATE untuk SQLite. Row existing dengan `jumlah_roll = NULL` (komponen berdimensi lama yang belum set roll) jadi 1. Ini benar karena BOM "per 1 unit produk jual" selalu 1 potong.
7. **Validasi ownership `unit_price_id`** — cek `harga_barang_satuan.barang_id === parent_barang_id`. Mencegah BOM scoped ke produk jual barang lain. 422 dengan pesan Indonesia.