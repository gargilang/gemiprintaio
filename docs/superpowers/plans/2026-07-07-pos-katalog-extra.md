# Sub-proyek C: POS & Katalog Extra — Quick-Add, Safeguard Pending, Pilih Barang, TRANSFER, Populer, Kategori — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) atau superpowers:executing-plans untuk menjalankan plan ini task-by-task. Langkah memakai sintaks checkbox (`- [ ]`).
> **Prasyarat:** Sub-proyek B (cabang BARANG HPP BOM di `createSaleAttempt`) selesai dulu, ATAU jalan paralel asal tidak overlap baris yang sama (lihat "Cross-dependency" di Global Constraints).

**Goal:** Enam isu POS & Katalog Extra:
- **C1** — quick-add POS tanpa wajib vendor/HPP, simpan ke `katalog_maklon` + keranjang.
- **C2** — safeguard "pending then reconcile": item maklon tanpa vendor+biaya → `pending_vendor_hpp=1`, HPP=0, skip PO/SPK item/keuangan HPP. Reconcile manual via queue UI.
- **C3** — katalog extra lewat flow Pilih Barang (form qty/harga/biaya tambahan, tanpa finishing/roll).
- **C4** — metode bayar vendor `TRANSFER` (DB CHECK + Zod + UI + service). TRANSFER = CASH behavior (post keuangan langsung), BUKAN hutang.
- **C5** — sistem Populer: `popuer_status` manual + auto-compute dari `item_penjualan` 30 hari. Badge Populer di POS jadi sort toggle.
- **C6** — `katalog_maklon.kategori_id` FK → `kategori_barang`, dropdown di modal, join `kategori_nama` di POS + muncul di filter chip.

**Architecture:** Task 1 sentral: satu file migrasi Supabase additive + sinkron SQLite (table-rebuild untuk CHECK constraint `metode_bayar_vendor`/`metode_bayar_vendor_default` + ADD COLUMN) + runtime ALTER/rebuild di `db-unified.ts`. Task 2-8 implement per-isu. Service `pos-mutations` (pending maklon), `katalog-maklon-service` (kategori_id, popuer_status, TRANSFER), `getPopularItemsAction` memakai TDD. Task 9 verifikasi.

**Tech Stack:** Next.js 15 (App Router, server actions), React 19, SWR (`useCachedData`), Supabase Postgres, SQLite (Tauri fallback), Zod, Jest (node + jsdom), Tailwind CSS, Bahasa Indonesia.

## Cross-dependency dengan plan B

Plan B mengubah `createSaleAttempt` cabang **BARANG** (HPP dari BOM). Plan C mengubah cabang **MAKLON** (pending) + validasi pre-flight (L385-409) + grouping PO (L978-1023). Tidak overlap baris. Urutan aman:
- **B selesai dulu** (disarankan), lalu C. ATAU
- **Paralel** asal dua agent tidak edit `pos-mutations.ts` di waktu sama (komentar di task 3 & 4 menandai lokasi yang dipegang C).

Lokasi yang dipegang C di `pos-mutations.ts`: L385-412 (validasi), L569-668 (HPP + saleItem insert), L884-945 (SPK item), L978-1023 (PO grouping). Lokasi yang dipegang B: cabang BARANG HPP (~L588-602). Beda blok → aman paralel dengan koordinasi.

## Catatan penting: `createMaklonPurchase` & TRANSFER

`createMaklonPurchase` ada di **`src/lib/services/purchases-mutations.ts`** (BUKAN `purchases-service.ts` — nama file di spec sedikit meleset). Signature sekarang (L601-627):

```ts
export async function createMaklonPurchase(input: {
  // ...
  metodeBayar: "CASH" | "NET30";
  // ...
}): Promise<{ id: string }> {
  // ...
  if (input.metodeBayar !== "CASH" && input.metodeBayar !== "NET30") {
    throw new Error(`Metode bayar vendor tidak valid: ${input.metodeBayar}`);
  }
  const jumlahDibayar = input.metodeBayar === "CASH" ? totalHarga : 0;
  const statusPembayaran = input.metodeBayar === "CASH" ? "LUNAS" : "HUTANG";
  // ...
  if (input.metodeBayar === "CASH") {
    // post keuangan [REF:purchaseId], metode_pembayaran = "CASH"
  } else {
    // create hutang_pembelian (NET30, jatuh tempo +30 hari)
  }
}
```

**Perubahan untuk TRANSFER (task 2):** lebarkan tipe → `"CASH" | "NET30" | "TRANSFER"`, relax validasi, dan perlakukan TRANSFER **sama persis dengan CASH** (post keuangan langsung, `metode_pembayaran = "TRANSFER"`, `jumlah_dibayar = totalHarga`, `status_pembayaran = "LUNAS"`, TIDAK buat hutang). Cukup ganti `=== "CASH"` → `=== "CASH" || === "TRANSFER"` di tiga tempat (jumlahDibayar, statusPembayaran, cabang keuangan).

## Global Constraints

- Bahasa Indonesia untuk semua UI strings, komentar baru, pesan error, nama kolom/tabel baru. Framework/library terms boleh English.
- **Schema change = 3 tempat sync:** (a) `supabase/migrations/20260707000003_pos_katalog_extra.sql` (additive, `IF NOT EXISTS`), (b) `database/sqlite-schema.sql`, (c) runtime ALTER/rebuild idempoten di `src/lib/db-unified.ts`. Migrasi yang sudah applied ke cloud IMMUTABLE — tulis baru.
- Migrasi timestamp: **`20260707000003`** (lanjut plan A `20260707000001` + plan B `20260707000002`).
- CHECK constraint `metode_bayar_vendor` (di `item_penjualan`) dan `metode_bayar_vendor_default` (di `katalog_maklon`) harus di-lebarkan ke `TRANSFER`. SQLite tidak bisa `ALTER ... DROP CONSTRAINT` → pakai **table-rebuild** (precedent: `harga_barang_satuan` rebuild di `db-unified.ts` L1591-1688). Postgres: `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`.
- Mutating server action wajib auth guard: `createKatalogMaklonAction`/`updateKatalogMaklonAction`/`deleteKatalogMaklonAction` pakai `requireAdminOrManager` (sudah ada). `reconcilePendingMaklonItemAction` pakai `requireOperationalRole` (Staf+ boleh). `getPopularItemsAction` adalah read → `requireSession`. Identitas dari `session.uid` guard, JANGAN trust `x-session-uid`.
- Validasi input mutasi pakai Zod (`src/lib/schemas/`). `safeParse` → 422/error. `z.coerce.number().finite()` untuk uang/qty. `.passthrough()` supaya tidak ada field yang silent drop.
- `db.query/queryOne/insert/update/delete/transaction` dari `src/lib/db-unified.ts` — jangan import client Supabase/SQLite langsung dari feature code.
- Tidak boleh import `getSupabaseAdmin` dari client code.
- Fetch data client pakai `useCachedData` (SWR) dengan stable cache key. Bust cross-page via `useInvalidate("key")`.
- **Money/ledger:** reconcile pending maklon post HPP keuangan dengan token `[REF:<itemPenjualanId>]` di `keperluan`. `createMaklonPurchase` CASH/TRANSFER → post `keuangan` langsung; NET30 → buat `hutang_pembelian`.
- Dark mode wajib: setiap color class butuh pasangan `dark:`.
- Icons: SVG components dari `src/components/icons/`, jangan emoji.
- **TDD** untuk service `pos-mutations` (pending maklon), `katalog-maklon-service` (kategori_id, popuer_status, TRANSFER), dan `getPopularItemsAction`. Component test untuk modal.
- **Verify sebelum "done":** `npm run type-check` (0 error) → `npm run build` → `npx jest <test terkait>`. Lint warning baru harus diperbaiki.
- Node 22 + npm.

## File Structure

**Modify:**
- `supabase/migrations/20260707000003_pos_katalog_extra.sql` (CREATE) — semua schema changes C2/C4/C5/C6.
- `database/sqlite-schema.sql` — `item_penjualan` + `katalog_maklon` + `harga_barang_satuan` (kolom baru + CHECK lebbar).
- `src/lib/db-unified.ts` — runtime ALTER ADD COLUMN `pending_vendor_hpp`/`katalog_maklon_id` (item_penjualan), `popuer_status` (harga_barang_satuan + katalog_maklon), `kategori_id` (katalog_maklon); table-rebuild `item_penjualan` + `katalog_maklon` untuk lebarkan CHECK `metode_bayar_vendor`/`metode_bayar_vendor_default`.
- `src/lib/schemas/katalog-maklon.ts` — enum `metode_bayar_vendor_default` + `TRANSFER`; `kategori_id` nullable; `popuer_status` (ganti/beriring `urutan`).
- `src/lib/services/katalog-maklon-service.ts` — `KatalogMaklon` interface (`metode_bayar_vendor_default` + TRANSFER, `kategori_id`, `kategori_nama`, `popuer_status`); `createKatalogMaklon`/`updateKatalogMaklon` simpan `kategori_id`+`popuer_status`; `listKatalogMaklon` join `kategori_barang` → `kategori_nama`; ganti `orderBy urutan` → `popuer_status DESC, nama_produk`.
- `src/lib/services/purchases-mutations.ts` — `createMaklonPurchase` terima `TRANSFER` = CASH behavior.
- `src/lib/services/pos-mutations.ts` — validasi pre-flight L385-412 (vendor/biaya opsional + TRANSFER); HPP branch L581-584 (pending=0); `saleItem` insert L630-664 (`pending_vendor_hpp`, `katalog_maklon_id`); SPK item L884-945 (skip pending); PO grouping L978-1023 (skip pending + cast TRANSFER).
- `src/app/pos/pos-types.ts` — `CartItem.metode_bayar_vendor` + `TRANSFER`; `UnitPrice.popuer_status?`; `ProdukJualFlat.metode_bayar_vendor_default` + `TRANSFER`.
- `src/app/pos/actions.ts` — `getPopularItemsAction`; `reconcilePendingMaklonItemAction` (atau taruh di `src/app/katalog-maklon/actions.ts`).
- `src/app/pos/page.tsx` — `handleProdukJualClick` (virtual material maklon); form area (hide finishing/roll maklon); `buildCartItemFromForm` (branch maklon); `handleEditCartItem` (alihkan maklon ke form); `handleSaveTambahItemLainnya` (simpan ke `katalog_maklon` + cart); `materialCategories` include katalog; `produkJualList.kategori_nama` dari join; state `sortPopuler` + badge toggle + sort `filteredProdukJual`.
- `src/app/pos/ModalTambahItemLainnya.tsx` — relaksasi validasi vendor/biaya; opsi TRANSFER; field opsional nullable.
- `src/app/pos/ModalRincianInternalMaklon.tsx` — opsi TRANSFER; validasi vendor/biaya opsional (reconcile dari cart tetap boleh pending).
- `src/app/katalog-maklon/ModalKatalogMaklon.tsx` — opsi TRANSFER; dropdown kategori; ganti "Urutan Tampil" → checkbox "Tandai Populer".
- `src/app/katalog-maklon/actions.ts` — `getKategoriBarangAction` (jika perlu); `reconcilePendingMaklonItemAction` (pilih lokasi); `listPendingMaklonAction`.
- `src/app/katalog-maklon/page.tsx` — section/tab "Pending Vendor/HPP" + modal reconcile.
- `src/components/barang/PanelHargaSatuan.tsx` — checkbox "Populer" per produk jual.
- `src/components/barang/types-barang.ts` — `UnitPrice.popuer_status?: number`.
- `src/lib/sync-config.ts` — verifikasi `item_penjualan`/`katalog_maklon`/`harga_barang_satuan` sudah terdaftar (sudah — tidak perlu ubah, hanya cek).

**Create:**
- `src/lib/__tests__/pos-mutations-pending-maklon.test.ts` — TDD pending maklon (skip PO/SPK, `pending_vendor_hpp=1`, hpp=0).
- `src/lib/__tests__/katalog-maklon-service-extra.test.ts` — TDD `kategori_id`, `popuer_status`, `metode_bayar_vendor_default: TRANSFER`, join `kategori_nama`.
- `src/lib/__tests__/get-popular-items.test.ts` — TDD `getPopularItemsAction` (auto-compute + manual override).
- `src/app/pos/__tests__/ModalTambahItemLainnya.test.tsx` — simpan tanpa vendor/biaya → `onSuccess` field opsional null.
- `src/app/katalog-maklon/__tests__/ModalKatalogMaklon.test.tsx` — dropdown kategori, checkbox Populer, opsi TRANSFER.

---

### Task 1: Migrasi Supabase + SQLite schema + runtime ALTER/rebuild (C2/C4/C5/C6 gabung)

**Files:**
- Create: `supabase/migrations/20260707000003_pos_katalog_extra.sql`
- Modify: `database/sqlite-schema.sql` (`item_penjualan`, `katalog_maklon`, `harga_barang_satuan`)
- Modify: `src/lib/db-unified.ts` (runtime ALTER + 2 table-rebuild untuk CHECK)

**Interfaces:**
- Consumes: tabel `item_penjualan`, `katalog_maklon`, `harga_barang_satuan`, `kategori_barang` dengan kolom/CHECK lama.
- Produces: kolom baru `pending_vendor_hpp`, `katalog_maklon_id` (item_penjualan); `popuer_status`, `kategori_id` (katalog_maklon); `popuer_status` (harga_barang_satuan); CHECK `metode_bayar_vendor` & `metode_bayar_vendor_default` menerima `TRANSFER`. FK `katalog_maklon_id` → `katalog_maklon(id) ON DELETE SET NULL`, `kategori_id` → `kategori_barang(id) ON DELETE SET NULL`.

- [ ] **Step 1: Tulis migrasi Supabase**

Buat `supabase/migrations/20260707000003_pos_katalog_extra.sql`:

```sql
-- Sub-proyek C: POS & Katalog Extra. Additive, IF NOT EXISTS.
-- C2 + C5: item_penjualan pending + link katalog maklon.
ALTER TABLE "public"."item_penjualan"
  ADD COLUMN IF NOT EXISTS "pending_vendor_hpp" integer NOT NULL DEFAULT 0;
ALTER TABLE "public"."item_penjualan"
  ADD COLUMN IF NOT EXISTS "katalog_maklon_id" text;
ALTER TABLE "public"."item_penjualan"
  DROP CONSTRAINT IF EXISTS "item_penjualan_katalog_maklon_id_fkey";
ALTER TABLE "public"."item_penjualan"
  ADD CONSTRAINT "item_penjualan_katalog_maklon_id_fkey"
  FOREIGN KEY ("katalog_maklon_id") REFERENCES "public"."katalog_maklon"("id")
  ON DELETE SET NULL;

-- C4: lebarkan CHECK metode_bayar_vendor di item_penjualan supaya menerima TRANSFER.
ALTER TABLE "public"."item_penjualan"
  DROP CONSTRAINT IF EXISTS "item_penjualan_metode_bayar_vendor_check";
ALTER TABLE "public"."item_penjualan"
  ADD CONSTRAINT "item_penjualan_metode_bayar_vendor_check"
  CHECK ("metode_bayar_vendor" IS NULL OR "metode_bayar_vendor" IN ('CASH','NET30','TRANSFER'));

-- C4: lebarkan CHECK metode_bayar_vendor_default di katalog_maklon.
ALTER TABLE "public"."katalog_maklon"
  DROP CONSTRAINT IF EXISTS "katalog_maklon_metode_bayar_vendor_default_check";
ALTER TABLE "public"."katalog_maklon"
  ADD CONSTRAINT "katalog_maklon_metode_bayar_vendor_default_check"
  CHECK ("metode_bayar_vendor_default" IN ('CASH','NET30','TRANSFER'));

-- C5: popuer_status manual override.
ALTER TABLE "public"."harga_barang_satuan"
  ADD COLUMN IF NOT EXISTS "popuer_status" integer NOT NULL DEFAULT 0;
ALTER TABLE "public"."katalog_maklon"
  ADD COLUMN IF NOT EXISTS "popuer_status" integer NOT NULL DEFAULT 0;

-- C6: kategori_id FK + migrasi data free-text → id.
ALTER TABLE "public"."katalog_maklon"
  ADD COLUMN IF NOT EXISTS "kategori_id" text;
ALTER TABLE "public"."katalog_maklon"
  DROP CONSTRAINT IF EXISTS "katalog_maklon_kategori_id_fkey";
ALTER TABLE "public"."katalog_maklon"
  ADD CONSTRAINT "katalog_maklon_kategori_id_fkey"
  FOREIGN KEY ("kategori_id") REFERENCES "public"."kategori_barang"("id")
  ON DELETE SET NULL;
UPDATE "public"."katalog_maklon" km
  SET "kategori_id" = kb.id
  FROM "public"."kategori_barang" kb
  WHERE km.kategori = kb.nama AND km.kategori_id IS NULL;
```

Catatan: `popuer_status_cache` (spec C2.a) **SKIP untuk MVP** — tidak dipakai C5.b yang compute on-the-fly.

- [ ] **Step 2: Update `database/sqlite-schema.sql`**

Edit tiga blok `CREATE TABLE`:

1. `item_penjualan` (L676-712): tambah kolom + ganti baris CHECK `metode_bayar_vendor`:
```sql
pending_vendor_hpp INTEGER NOT NULL DEFAULT 0,
katalog_maklon_id TEXT,
...
metode_bayar_vendor TEXT CHECK(metode_bayar_vendor IS NULL OR metode_bayar_vendor IN ('CASH','NET30','TRANSFER')),
...
FOREIGN KEY (katalog_maklon_id) REFERENCES katalog_maklon(id) ON DELETE SET NULL,
```

2. `katalog_maklon` (L380-406): tambah kolom + ganti CHECK `metode_bayar_vendor_default`:
```sql
metode_bayar_vendor_default TEXT NOT NULL DEFAULT 'CASH' CHECK(metode_bayar_vendor_default IN ('CASH','NET30','TRANSFER')),
popuer_status INTEGER NOT NULL DEFAULT 0,
kategori_id TEXT,
...
FOREIGN KEY (kategori_id) REFERENCES kategori_barang(id) ON DELETE SET NULL,
```

3. `harga_barang_satuan` (L177-191): tambah `popuer_status INTEGER NOT NULL DEFAULT 0,` sebelum `dibuat_pada`.

- [ ] **Step 3: Tambah runtime ALTER idempoten + table-rebuild di `src/lib/db-unified.ts`**

Cari blok `ensureServerSyncQueueSchema` (L1549+). Tambah blok baru setelah blok `biaya_tambahan_penjualan`:

```ts
// Migrasi (20260707000003): item_penjualan kolom pending + katalog_maklon_id.
{
  const cols = (
    db.prepare("PRAGMA table_info(item_penjualan)").all() as Array<{ name: string }>
  ).map((c) => c.name);
  if (!cols.includes("pending_vendor_hpp")) {
    db.exec(
      "ALTER TABLE item_penjualan ADD COLUMN pending_vendor_hpp INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!cols.includes("katalog_maklon_id")) {
    db.exec("ALTER TABLE item_penjualan ADD COLUMN katalog_maklon_id TEXT");
  }
}

// Migrasi (20260707000003): katalog_maklon kolom popuer_status + kategori_id.
{
  const cols = (
    db.prepare("PRAGMA table_info(katalog_maklon)").all() as Array<{ name: string }>
  ).map((c) => c.name);
  if (!cols.includes("popuer_status")) {
    db.exec(
      "ALTER TABLE katalog_maklon ADD COLUMN popuer_status INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!cols.includes("kategori_id")) {
    db.exec("ALTER TABLE katalog_maklon ADD COLUMN kategori_id TEXT");
  }
}

// Migrasi (20260707000003): harga_barang_satuan kolom popuer_status.
{
  const cols = (
    db.prepare("PRAGMA table_info(harga_barang_satuan)").all() as Array<{ name: string }>
  ).map((c) => c.name);
  if (!cols.includes("popuer_status")) {
    db.exec(
      "ALTER TABLE harga_barang_satuan ADD COLUMN popuer_status INTEGER NOT NULL DEFAULT 0",
    );
  }
}
```

Lalu tambah dua blok **table-rebuild** (CHECK constraint SQLite tidak bisa di-ALTER, pakai pola rebuild seperti `harga_barang_satuan` L1591-1688):

```ts
// Migrasi (20260707000003): lebarkan CHECK metode_bayar_vendor di item_penjualan
// supaya menerima 'TRANSFER'. SQLite tidak bisa DROP CONSTRAINT → rebuild tabel.
{
  const oldCheck = db
    .prepare(
      `SELECT 1 FROM sqlite_master WHERE type='table' AND name='item_penjualan'
       AND sql LIKE "%metode_bayar_vendor IN ('CASH','NET30'))%" AND sql NOT LIKE "%TRANSFER%" LIMIT 1`,
    )
    .get();
  if (oldCheck) {
    // Rebuild: baca kolom via PRAGMA, buat tabel __new dengan CHECK baru, copy data,
    // drop old, rename, recreate index. Ikuti pola harga_barang_satuan rebuild di atas.
    // ... (implementasi rebuild — kolom diambil dari PRAGMA table_info, CHECK diganti)
    // Idempoten: setelah rebuild, sql LIKE tidak match lagi → skip.
  }
}
```

(Sama untuk `katalog_maklon.metode_bayar_vendor_default`.) Implementasi rebuild mengikuti persis pola `harga_barang_satuan` L1611-1688: baca `PRAGMA table_info`, bangun `colDefs` dengan default, `INSERT ... SELECT` semua kolom, `DROP TABLE`, `RENAME`, recreate index. **Penting:** bungkus dalam `db.transaction` + `db.pragma("foreign_keys = OFF")`/`ON`. Saat membangun `colDefs`, ganti definisi kolom `metode_bayar_vendor`/`metode_bayar_vendor_default` dengan CHECK yang baru (deteksi via nama kolom + injeksi string CHECK baru alih-alih pakai `c.dflt_value` mentah untuk kolom itu).

- [ ] **Step 4: Cek `src/lib/sync-config.ts`**

Run: `grep -n "item_penjualan\|katalog_maklon\|harga_barang_satuan" src/lib/sync-config.ts`
Expected: ketiganya sudah terdaftar di `CORE_SYNC_TABLES`/`MASTER_SYNC_TABLES`. Tidak perlu ubah.

- [ ] **Step 5: Verifikasi type-check**

Run: `npm run type-check`
Expected: 0 error (DB schema saja, belum ada kode TS yang konsumsi kolom baru).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260707000003_pos_katalog_extra.sql database/sqlite-schema.sql src/lib/db-unified.ts
git commit -m "feat(db): migrasi POS & Katalog Extra (pending maklon, kategori_id, popuer_status, TRANSFER)"
```

---

### Task 2: C4 — Zod schema + types + UI options TRANSFER + service `createMaklonPurchase` terima TRANSFER

**Files:**
- Modify: `src/lib/schemas/katalog-maklon.ts`
- Modify: `src/lib/services/katalog-maklon-service.ts` (`KatalogMaklon` interface L6-21)
- Modify: `src/app/pos/pos-types.ts` (`CartItem.metode_bayar_vendor`, `SubkontraktorOption`, `ProdukJualFlat.metode_bayar_vendor_default`)
- Modify: `src/app/pos/ModalTambahItemLainnya.tsx` (L38 state, L238-248 select)
- Modify: `src/app/pos/ModalRincianInternalMaklon.tsx` (L30 state, select)
- Modify: `src/app/katalog-maklon/ModalKatalogMaklon.tsx` (L311-326 select)
- Modify: `src/lib/services/purchases-mutations.ts` (`createMaklonPurchase` L601-727)
- Modify: `src/lib/services/pos-mutations.ts` (validasi L398-405 + grouping cast L996/L1013)
- Test: `src/lib/__tests__/katalog-maklon-service-extra.test.ts` (create dengan `metode_bayar_vendor_default: "TRANSFER"`)

**Interfaces:**
- Consumes: DB CHECK sudah menerima TRANSFER (Task 1).
- Produces: type/schema/UI/service menerima `TRANSFER`. `createMaklonPurchase` TRANSFER = CASH behavior.

- [ ] **Step 1: Tulis failing test**

Buat `src/lib/__tests__/katalog-maklon-service-extra.test.ts` (mirror pola `katalog-maklon-service.test.ts` L1-17):

```ts
import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return { db: real.__mock.db, generateId: real.__mock.generateId, getCurrentTimestamp: real.__mock.getCurrentTimestamp };
});

import { createKatalogMaklon, listKatalogMaklon } from "../services/katalog-maklon-service";

beforeEach(() => resetMockDb());

describe("katalog-maklon TRANSFER + kategori + populer", () => {
  it("menerima metode_bayar_vendor_default = TRANSFER", async () => {
    const r = await createKatalogMaklon(
      {
        nama_produk: "Banner Transfer Test",
        nama_satuan: "pcs",
        harga_jual_default: 50000,
        biaya_subkontrak_default: 30000,
        vendor_subkontrak_id_default: "v1",
        metode_bayar_vendor_default: "TRANSFER",
        kategori_id: "kat-1",
        popuer_status: 1,
        is_aktif: 1,
      } as any,
      "uid-1",
    );
    expect(r.metode_bayar_vendor_default).toBe("TRANSFER");
    expect(r.kategori_id).toBe("kat-1");
    expect(r.popuer_status).toBe(1);
  });

  it("reject metode bayar invalid via Zod", async () => {
    await expect(
      createKatalogMaklon(
        { nama_produk: "X", nama_satuan: "pcs", harga_jual_default: 1, biaya_subkontrak_default: 0, metode_bayar_vendor_default: "QRCIS" as any } as any,
        "uid-1",
      ),
    ).rejects.toThrow(/metode|invalid/i);
  });
});
```

- [ ] **Step 2: Run test → FAIL**

Run: `npx jest src/lib/__tests__/katalog-maklon-service-extra.test.ts`
Expected: FAIL (schema enum belum terima TRANSFER; `popuer_status`/`kategori_id` belum ada di input type).

- [ ] **Step 3: Update Zod schema**

Edit `src/lib/schemas/katalog-maklon.ts`:

Before:
```ts
metode_bayar_vendor_default: z.enum(["CASH", "NET30"]).default("CASH"),
kategori: z.string().nullable().optional(),
// ...
urutan: z.coerce.number().int().min(0).default(0),
```
After:
```ts
metode_bayar_vendor_default: z.enum(["CASH", "NET30", "TRANSFER"]).default("CASH"),
kategori: z.string().nullable().optional(),
kategori_id: z.string().nullable().optional(),
popuer_status: z.coerce.number().int().min(0).max(1).default(0),
// urutan tetap (backwards-compat, UI disembunyikan):
urutan: z.coerce.number().int().min(0).default(0),
```

- [ ] **Step 4: Update `KatalogMaklon` interface + create/update**

Edit `src/lib/services/katalog-maklon-service.ts`:

Interface (L6-21):
```ts
export interface KatalogMaklon {
  id: string;
  nama_produk: string;
  nama_satuan: string;
  harga_jual_default: number;
  biaya_subkontrak_default: number;
  vendor_subkontrak_id_default: string | null;
  metode_bayar_vendor_default: "CASH" | "NET30" | "TRANSFER";
  kategori: string | null;          // legacy free-text, tetap disimpan
  kategori_id: string | null;       // FK ke kategori_barang
  kategori_nama?: string | null;    // dari join, untuk POS/modal
  popuer_status: number;            // 0/1 manual override
  catatan_internal: string | null;
  is_aktif: number;
  urutan: number;
  dibuat_oleh: string | null;
  dibuat_pada: string;
  diperbarui_pada: string;
}
```

`createKatalogMaklon` insert (L46-61) + `updateKatalogMaklon` (L71-83): tambah field `kategori_id: data.kategori_id || null, popuer_status: data.popuer_status,` di insert dan update. Return object (L63) sertakan field baru.

- [ ] **Step 5: Update pos-types**

`src/app/pos/pos-types.ts`:
- `CartItem.metode_bayar_vendor` (L83): `?: "CASH" | "NET30" | "TRANSFER";`
- `ProdukJualFlat.metode_bayar_vendor_default` (L146): `?: "CASH" | "NET30" | "TRANSFER";`
- `UnitPrice` (L20-28): tambah `popuer_status?: number;` (dipakai C5).

- [ ] **Step 6: Update `createMaklonPurchase`**

Edit `src/lib/services/purchases-mutations.ts` L601-727:

Before:
```ts
metodeBayar: "CASH" | "NET30";
// ...
if (input.metodeBayar !== "CASH" && input.metodeBayar !== "NET30") {
  throw new Error(`Metode bayar vendor tidak valid: ${input.metodeBayar}`);
}
const jumlahDibayar = input.metodeBayar === "CASH" ? totalHarga : 0;
const statusPembayaran = input.metodeBayar === "CASH" ? "LUNAS" : "HUTANG";
// ...
if (input.metodeBayar === "CASH") {
  // post keuangan, metode_pembayaran = "CASH" (sebenarnya input.metodeBayar)
} else {
  // create hutang_pembelian
}
```
After:
```ts
metodeBayar: "CASH" | "NET30" | "TRANSFER";
// ...
if (!["CASH", "NET30", "TRANSFER"].includes(input.metodeBayar)) {
  throw new Error(`Metode bayar vendor tidak valid: ${input.metodeBayar}`);
}
// TRANSFER = bayar langsung seperti CASH (post keuangan), BUKAN hutang.
const isLunas = input.metodeBayar === "CASH" || input.metodeBayar === "TRANSFER";
const jumlahDibayar = isLunas ? totalHarga : 0;
const statusPembayaran = isLunas ? "LUNAS" : "HUTANG";
// ...
if (isLunas) {
  // post keuangan [REF:purchaseId], metode_pembayaran = input.metodeBayar (CASH atau TRANSFER)
} else {
  // create hutang_pembelian (NET30)
}
```

Catatan: di cabang keuangan, pastikan `metode_pembayaran` di row `pembelian` (L651) pakai `input.metodeBayar` (sudah benar — akan jadi "TRANSFER"). Di insert `keuangan`, tidak ada kolom metode_pembayaran; yang penting `reference_type`/`keperluan` konsisten.

- [ ] **Step 7: Update validasi + grouping di `pos-mutations.ts`**

Edit `src/lib/services/pos-mutations.ts` L398-405:
Before:
```ts
if (
  item.metode_bayar_vendor !== "CASH" &&
  item.metode_bayar_vendor !== "NET30"
) {
  throw new Error(`Item ${i + 1} (Maklon): metode bayar vendor harus CASH atau NET30`);
}
```
After:
```ts
if (!["CASH", "NET30", "TRANSFER"].includes(item.metode_bayar_vendor || "")) {
  throw new Error(`Item ${i + 1} (Maklon): metode bayar vendor tidak valid (CASH/NET30/TRANSFER)`);
}
```
(Catatan: blok ini akan di-relaksasi lebih lanjut di Task 4 — vendor/biaya jadi opsional.)

Grouping (L996, L1013): ganti tipe `metodeBayar: "CASH" | "NET30"` → `"CASH" | "NET30" | "TRANSFER"`, dan cast `it.metode_bayar_vendor as "CASH" | "NET30" | "TRANSFER"`.

- [ ] **Step 8: Tambah opsi TRANSFER di 3 modal**

`ModalTambahItemLainnya.tsx` L38: `useState<"CASH" | "NET30" | "TRANSFER">("CASH")`. L242: `setMetodeBayar(e.target.value as "CASH" | "NET30" | "TRANSFER")`. L244-247 select options — tambah:
```tsx
<option value="CASH">CASH (tunai)</option>
<option value="NET30">NET30 (jadi hutang)</option>
<option value="TRANSFER">TRANSFER (bayar langsung via bank)</option>
```

`ModalRincianInternalMaklon.tsx` L30 + select: sama, tambah opsi TRANSFER.

`ModalKatalogMaklon.tsx` L316-318: cast `"CASH" | "NET30" | "TRANSFER"`. L322-325 select — tambah:
```tsx
<option value="CASH">CASH (bayar langsung)</option>
<option value="NET30">NET30 (jadi hutang)</option>
<option value="TRANSFER">TRANSFER (bayar langsung via bank)</option>
```

- [ ] **Step 9: Run test → PASS**

Run: `npx jest src/lib/__tests__/katalog-maklon-service-extra.test.ts`
Expected: PASS, 2 test.

- [ ] **Step 10: Run type-check + build**

Run: `npm run type-check && npm run build`
Expected: 0 error, build sukses.

- [ ] **Step 11: Commit**

```bash
git add src/lib/schemas/katalog-maklon.ts src/lib/services/katalog-maklon-service.ts src/lib/services/purchases-mutations.ts src/lib/services/pos-mutations.ts src/app/pos/pos-types.ts src/app/pos/ModalTambahItemLainnya.tsx src/app/pos/ModalRincianInternalMaklon.tsx src/app/katalog-maklon/ModalKatalogMaklon.tsx src/lib/__tests__/katalog-maklon-service-extra.test.ts
git commit -m "feat(pos,katalog): metode bayar vendor TRANSFER + type/schema lebbar"
```

---

### Task 3: C1 — `ModalTambahItemLainnya` relaksasi validasi + simpan ke `katalog_maklon` + cart

**Files:**
- Modify: `src/app/pos/ModalTambahItemLainnya.tsx` (interface L7-15, validasi L77-81, state L38, onSave L85-93)
- Modify: `src/app/pos/page.tsx` (`handleSaveTambahItemLainnya` L809-830)
- Test: `src/app/pos/__tests__/ModalTambahItemLainnya.test.tsx` (create)

**Interfaces:**
- Consumes: `createKatalogMaklonAction` (di `src/app/katalog-maklon/actions.ts`), `useInvalidate` hook.
- Produces: modal simpan tanpa vendor/biaya → field opsional null. Parent simpan ke `katalog_maklon` + tambah cart dengan `katalog_maklon_id` + `pending_vendor_hpp` (computed di service, bukan cart).

- [ ] **Step 1: Tulis failing component test**

Buat `src/app/pos/__tests__/ModalTambahItemLainnya.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ModalTambahItemLainnya from "../ModalTambahItemLainnya";

describe("ModalTambahItemLainnya", () => {
  it("simpan dengan nama+satuan+harga saja (tanpa vendor/biaya) → onSuccess field opsional null", async () => {
    const onSave = jest.fn();
    render(
      <ModalTambahItemLainnya
        open
        subkontraktor={[]}
        onClose={jest.fn()}
        onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Nama item/i), { target: { value: "Banner Custom" } });
    fireEvent.change(screen.getByLabelText(/Harga jual/i), { target: { value: "60000" } });
    fireEvent.click(screen.getByText("Simpan"));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const v = onSave.mock.calls[0][0];
    expect(v.barang_nama).toBe("Banner Custom");
    expect(v.harga_satuan).toBe(60000);
    expect(v.vendor_subkontrak_id).toBeNull();
    expect(v.biaya_subkontrak).toBeNull();
    expect(v.metode_bayar_vendor).toBeNull();
  });
});
```

- [ ] **Step 2: Run test → FAIL**

Run: `npx jest src/app/pos/__tests__/ModalTambahItemLainnya.test.tsx`
Expected: FAIL (validasi L77-81 blok simpan tanpa vendor/biaya).

- [ ] **Step 3: Relaksasi validasi + interface di modal**

Edit `src/app/pos/ModalTambahItemLainnya.tsx`:

Interface (L7-15):
```ts
export interface TambahItemLainnyaValue {
  barang_nama: string;
  jumlah: number;
  nama_satuan: string;
  harga_satuan: number;
  vendor_subkontrak_id?: string | null;
  biaya_subkontrak?: number | null;
  metode_bayar_vendor?: "CASH" | "NET30" | "TRANSFER" | null;
}
```

State (L36-38): `const [vendorId, setVendorId] = useState<string | null>(null);`, `const [biayaSubkontrak, setBiayaSubkontrak] = useState<string>("");`, `const [metodeBayar, setMetodeBayar] = useState<"CASH" | "NET30" | "TRANSFER" | null>("CASH");`

Validasi (L77-81) — hapus blok wajib, ganti:
```ts
// Vendor/biaya/metode OPSIONAL. Pending (vendor/biaya kosong) ditangani safeguard
// C2 di pos-mutations. Kalau vendor diisi, biaya juga wajib > 0 + metode valid.
if (vendorId) {
  if (!Number.isFinite(parsedBiaya) || parsedBiaya <= 0) {
    setTampilkanInternal(true);
    setError("Biaya subkontrak harus lebih dari 0 bila vendor dipilih.");
    return;
  }
}
```

`onSave` (L85-93):
```ts
onSave({
  barang_nama: namaItem.trim(),
  jumlah: parsedJumlah,
  nama_satuan: namaSatuan,
  harga_satuan: parsedHarga,
  vendor_subkontrak_id: vendorId || null,
  biaya_subkontrak: vendorId ? parsedBiaya : null,
  metode_bayar_vendor: vendorId ? metodeBayar : null,
});
```

Reset form: `setVendorId(null); setBiayaSubkontrak(""); setMetodeBayar("CASH");` sesuaikan tipe.

- [ ] **Step 4: Run component test → PASS**

Run: `npx jest src/app/pos/__tests__/ModalTambahItemLainnya.test.tsx`
Expected: PASS.

- [ ] **Step 5: Update `handleSaveTambahItemLainnya` di `pos/page.tsx`**

Edit L809-830. Buat `async`, panggil `createKatalogMaklonAction` untuk simpan ke `katalog_maklon`, lalu tambah cart dengan `katalog_maklon_id`:

```ts
const handleSaveTambahItemLainnya = async (v: TambahItemLainnyaValue) => {
  // 1. Simpan ke katalog_maklon (vendor=null/biaya=null jika kosong → pending).
  let katalogMaklonId: string | undefined;
  try {
    const created = await createKatalogMaklonAction({
      nama_produk: v.barang_nama,
      nama_satuan: v.nama_satuan,
      harga_jual_default: v.harga_satuan,
      biaya_subkontrak_default: v.biaya_subkontrak ?? 0,
      vendor_subkontrak_id_default: v.vendor_subkontrak_id ?? null,
      metode_bayar_vendor_default: v.metode_bayar_vendor ?? "CASH",
      kategori: null,
      kategori_id: null,
      popuer_status: 0,
      is_aktif: 1,
    });
    katalogMaklonId = (created as any)?.id;
  } catch (e: any) {
    showMsg("error", `Gagal simpan ke katalog: ${e?.message || e}`);
    return; // jangan tambah ke cart bila gagal
  }

  // 2. Tambah ke cart dengan katalog_maklon_id. pending_vendor_hpp di-set di
  //    service (Task 4) berdasarkan vendor/biaya kosong — cart tidak perlu flag.
  const vendor = subkontraktor.find((s) => s.id === v.vendor_subkontrak_id);
  const newItem: CartItem = {
    barang_id: ID_BARANG_PLACEHOLDER_MAKLON,
    barang_nama: v.barang_nama,
    harga_satuan_id: ID_HARGA_PLACEHOLDER_MAKLON,
    nama_satuan: v.nama_satuan,
    faktor_konversi: 1,
    harga_satuan: v.harga_satuan,
    jumlah: v.jumlah,
    subtotalRaw: v.jumlah * v.harga_satuan,
    originalHargaSatuan: v.harga_satuan,
    tipe_item: "MAKLON",
    katalog_maklon_id: katalogMaklonId,
    vendor_subkontrak_id: v.vendor_subkontrak_id ?? undefined,
    vendor_subkontrak_nama: vendor?.nama_perusahaan,
    biaya_subkontrak: v.biaya_subkontrak ?? undefined,
    metode_bayar_vendor: v.metode_bayar_vendor ?? undefined,
    deskripsi_pekerjaan: v.barang_nama,
  };
  setCart((prev) => [...prev, newItem]);
  setShowTambahItemLainnya(false);
  // 3. Bust cache katalog supaya item muncul di halaman Katalog Extra.
  invalidate("katalog-maklon");
};
```

Tambah import `createKatalogMaklonAction` dari `@/app/katalog-maklon/actions` + `useInvalidate` dari `@/lib/use-cached-data`. `handleSaveTambahItemLainnya` jadi `async` — pastikan tombol Simpan modal tidak double-fire (modal sudah set `saving`).

- [ ] **Step 6: Run type-check + build**

Run: `npm run type-check && npm run build`
Expected: 0 error.

- [ ] **Step 7: Commit**

```bash
git add src/app/pos/ModalTambahItemLainnya.tsx src/app/pos/page.tsx src/app/pos/__tests__/ModalTambahItemLainnya.test.tsx
git commit -m "feat(pos): quick-add katalog maklon tanpa wajib vendor/HPP + simpan ke katalog_maklon"
```

---

### Task 4: C2 — `createSaleAttempt` relaksasi validasi + pending maklon handling (TDD)

**Files:**
- Modify: `src/lib/services/pos-mutations.ts` (validasi L385-412, HPP L581-584, saleItem L630-664, SPK item L884-945, PO grouping L1007-1023)
- Test: `src/lib/__tests__/pos-mutations-pending-maklon.test.ts` (create)

**Interfaces:**
- Consumes: kolom `pending_vendor_hpp` + `katalog_maklon_id` di `item_penjualan` (Task 1). Validasi TRANSFER (Task 2).
- Produces: item maklon tanpa vendor/biaya → checkout sukses, `pending_vendor_hpp=1`, `katalog_maklon_id` persisted, HPP=0, no PO, no SPK item.

- [ ] **Step 1: Tulis failing test**

Buat `src/lib/__tests__/pos-mutations-pending-maklon.test.ts` (mirror pola mock `void-sale-side-effects.test.ts` L1-50):

```ts
import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return { db: real.__mock.db, generateId: real.__mock.generateId, getCurrentTimestamp: real.__mock.getCurrentTimestamp };
});
jest.mock("@/lib/services/purchases-service", () => ({
  __esModule: true,
  createMaklonPurchase: jest.fn(),
  deleteMaklonPurchasesForSale: jest.fn(),
}));
jest.mock("@/lib/services/inventory-service", () => ({ __esModule: true, postInventoryMovement: jest.fn(), getRollVariants: jest.fn() }));
jest.mock("@/lib/services/shop-settings-service", () => ({ __esModule: true, getShopSettings: jest.fn() }));

import { createMaklonPurchase } from "@/lib/services/purchases-service";
import { createSale } from "../services/pos-service";

beforeEach(() => resetMockDb());

const baseSale = {
  kasir_id: "u1",
  pelanggan_id: "p1",
  tanggal: "2026-07-07",
  total_jumlah: 50000,
  jumlah_dibayar: 50000,
  metode_pembayaran: "CASH",
  items: [
    {
      tipe_item: "MAKLON" as const,
      barang_id: "barang-jasa-maklon",
      harga_satuan_id: "harga-jasa-maklon-pcs",
      nama_satuan: "pcs",
      faktor_konversi: 1,
      harga_satuan: 50000,
      jumlah: 1,
      subtotal: 50000,
      deskripsi_pekerjaan: "Banner custom pending",
      katalog_maklon_id: "km-1",
      // vendor_subkontrak_id & biaya_subkontrak TIDAK diisi → pending
    },
  ],
};

describe("pending maklon di createSale", () => {
  it("sukses dengan vendor/biaya kosong → pending_vendor_hpp=1, hpp=0, no PO, no SPK item", async () => {
    mockTable("pelanggan").set("p1", { id: "p1", nama: "Walk-in" });
    await createSale(baseSale as any);
    const items = mockTable("item_penjualan").all();
    expect(items).toHaveLength(1);
    expect(Number(items[0].pending_vendor_hpp)).toBe(1);
    expect(items[0].katalog_maklon_id).toBe("km-1");
    expect(Number(items[0].hpp_total)).toBe(0);
    expect(createMaklonPurchase).not.toHaveBeenCalled();
    // tidak ada item_produksi
    expect(mockTable("item_produksi").all()).toHaveLength(0);
  });

  it("vendor+biaya terisi → pending_vendor_hpp=0, PO maklon dibuat", async () => {
    mockTable("pelanggan").set("p1", { id: "p1", nama: "Walk-in" });
    await createSale({
      ...baseSale,
      items: [
        { ...baseSale.items[0], vendor_subkontrak_id: "v1", biaya_subkontrak: 30000, metode_bayar_vendor: "CASH" },
      ],
    } as any);
    const items = mockTable("item_penjualan").all();
    expect(Number(items[0].pending_vendor_hpp)).toBe(0);
    expect(Number(items[0].hpp_total)).toBe(30000);
    expect(createMaklonPurchase).toHaveBeenCalledTimes(1);
  });
});
```

Catatan: `createSale` memanggil `createSaleAttempt`; mock sesuai yang dipakai file (cek import sebenarnya di pos-mutations.ts). Sesuaikan nama field header (cek `CreateSaleData` di `pos-service.ts`).

- [ ] **Step 2: Run test → FAIL**

Run: `npx jest src/lib/__tests__/pos-mutations-pending-maklon.test.ts`
Expected: FAIL — validasi L388-405 throw "vendor wajib" untuk item pertama.

- [ ] **Step 3: Relaksasi validasi pre-flight**

Edit `src/lib/services/pos-mutations.ts` L385-412:

Before:
```ts
for (let i = 0; i < data.items.length; i++) {
  const item = data.items[i];
  if (item.tipe_item === "MAKLON") {
    if (!item.vendor_subkontrak_id) {
      throw new Error(`Item ${i + 1} (Maklon): vendor subkontraktor wajib dipilih`);
    }
    if (!item.biaya_subkontrak || item.biaya_subkontrak <= 0) {
      throw new Error(`Item ${i + 1} (Maklon): biaya subkontrak harus lebih dari 0`);
    }
    if (
      item.metode_bayar_vendor !== "CASH" &&
      item.metode_bayar_vendor !== "NET30"
    ) {
      throw new Error(`Item ${i + 1} (Maklon): metode bayar vendor harus CASH atau NET30`);
    }
    if (!item.deskripsi_pekerjaan?.trim()) {
      throw new Error(`Item ${i + 1} (Maklon): deskripsi pekerjaan wajib diisi`);
    }
  }
}
```
After:
```ts
for (let i = 0; i < data.items.length; i++) {
  const item = data.items[i];
  if (item.tipe_item === "MAKLON") {
    // deskripsi tetap wajib (label pekerjaan untuk SPK/laporan).
    if (!item.deskripsi_pekerjaan?.trim()) {
      throw new Error(`Item ${i + 1} (Maklon): deskripsi pekerjaan wajib diisi`);
    }
    // Vendor + biaya + metode OPSIONAL — pending (vendor/biaya kosong) ditangani
    // safeguard C2: pending_vendor_hpp=1, HPP=0, skip PO + SPK item. Reconcile nanti.
    if (item.vendor_subkontrak_id && (Number(item.biaya_subkontrak) || 0) > 0) {
      if (!["CASH", "NET30", "TRANSFER"].includes(item.metode_bayar_vendor || "")) {
        throw new Error(`Item ${i + 1} (Maklon): metode bayar vendor tidak valid (CASH/NET30/TRANSFER)`);
      }
    }
  }
}
```

- [ ] **Step 4: Pending maklon di HPP + saleItem insert**

Edit L569-664. Tambah flag + branch pending:

```ts
const isMaklon = item.tipe_item === "MAKLON";
const isJasa = item.tipe_item === "JASA";
const isPendingMaklon =
  isMaklon &&
  (!item.vendor_subkontrak_id ||
    !item.biaya_subkontrak ||
    Number(item.biaya_subkontrak) <= 0);

// ... di blok HPP (L581-584):
if (isMaklon) {
  if (isPendingMaklon) {
    hppSatuan = 0;       // belum ada modal dicatat
    hppTotal = 0;
  } else {
    const biaya = Number(item.biaya_subkontrak) || 0;
    hppTotal = biaya;
    hppSatuan = item.jumlah > 0 ? biaya / item.jumlah : biaya;
  }
}
```

Di object `saleItem` (L630-664), tambah field:
```ts
pending_vendor_hpp: isPendingMaklon ? 1 : 0,
katalog_maklon_id: isMaklon ? (item.katalog_maklon_id || null) : null,
```

- [ ] **Step 5: Skip SPK item untuk pending maklon**

Edit L884-945. Di awal loop `for (let i = 0; i < data.items.length; i++)` setelah `const isMaklon = ...` (L886), tambah:

```ts
const isPendingMaklon =
  isMaklon &&
  (!item.vendor_subkontrak_id ||
    !item.biaya_subkontrak ||
    Number(item.biaya_subkontrak) <= 0);
if (isMaklon && isPendingMaklon) continue; // tidak buat SPK item untuk pending
```

- [ ] **Step 6: Skip PO maklon untuk pending**

Edit L1007-1023 (loop `for (const [idx, saleItemId] of maklonItemIds)`):

```ts
for (const [idx, saleItemId] of maklonItemIds) {
  const it = data.items[idx];
  const isPending =
    !it.vendor_subkontrak_id ||
    !it.biaya_subkontrak ||
    Number(it.biaya_subkontrak) <= 0;
  if (isPending) continue; // skip, reconcile nanti (C2)
  const key = `${it.vendor_subkontrak_id}::${it.metode_bayar_vendor}`;
  // ... grouping + cast metodeBayar: "CASH" | "NET30" | "TRANSFER"
}
```

Catatan: `maklonItemIds` di-populate di L670+ (setelah insert). Pastikan hanya item non-pending yang masuk group, atau filter di sini (filter di sini lebih aman — `maklonItemIds` tetap semua, tapi loop skip pending). Verifikasi: `totalHpp` sudah exclude pending (hppTotal=0) → baris HPP keuangan 0 di-skip oleh guard `if (totalHpp > 0)` (L775). Void sale: HPP reversal pakai `item.hpp_satuan` yang 0 → aman (C2.g).

- [ ] **Step 7: Run test → PASS**

Run: `npx jest src/lib/__tests__/pos-mutations-pending-maklon.test.ts`
Expected: PASS, 2 test.

- [ ] **Step 8: Run regression test pos + void**

Run: `npx jest src/lib/__tests__/void-sale-side-effects.test.ts src/lib/__tests__/pos`
Expected: semua PASS (tidak ada regression).

- [ ] **Step 9: Run type-check + build**

Run: `npm run type-check && npm run build`
Expected: 0 error.

- [ ] **Step 10: Commit**

```bash
git add src/lib/services/pos-mutations.ts src/lib/__tests__/pos-mutations-pending-maklon.test.ts
git commit -m "feat(pos): safeguard pending maklon — relaksasi validasi + skip PO/SPK/HPP untuk item tanpa vendor/HPP"
```

---

### Task 5: C2 — `reconcilePendingMaklonItemAction` + UI queue "Pending Vendor/HPP"

**Files:**
- Modify: `src/app/katalog-maklon/actions.ts` — `listPendingMaklonAction` + `reconcilePendingMaklonItemAction`.
- Modify: `src/lib/services/katalog-maklon-service.ts` (atau service baru `pending-maklon-service.ts`) — query `item_penjualan` join `penjualan` where `pending_vendor_hpp=1`; reconcile logic.
- Modify: `src/lib/schemas/katalog-maklon.ts` (atau schema baru) — Zod `reconcilePendingMaklonInput`.
- Modify: `src/app/katalog-maklon/page.tsx` — section "Pending Vendor/HPP" + modal reconcile.
- Create: `src/app/katalog-maklon/ModalReconcilePendingMaklon.tsx`.

**Interfaces:**
- Consumes: kolom `pending_vendor_hpp` + `katalog_maklon_id` (Task 1) + pending items dari Task 4.
- Produces: Staf+ bisa lihat queue + isi vendor/biaya/metode → recompute HPP, post keuangan `[REF:itemPenjualanId]`, buat PO maklon, set `pending_vendor_hpp=0`.

- [ ] **Step 1: Tulis failing test untuk reconcile**

Tambah ke `src/lib/__tests__/pos-mutations-pending-maklon.test.ts` (atau file baru `pending-maklon-reconcile.test.ts`):

```ts
import { reconcilePendingMaklonItem } from "../services/pending-maklon-service";

describe("reconcilePendingMaklonItem", () => {
  it("update vendor+biaya, set pending_vendor_hpp=0, recompute HPP, post keuangan [REF], create PO", async () => {
    mockTable("item_penjualan").set("it-1", {
      id: "it-1",
      penjualan_id: "s1",
      tipe_item: "MAKLON",
      pending_vendor_hpp: 1,
      katalog_maklon_id: "km-1",
      harga_satuan: 50000,
      jumlah: 1,
      subtotal: 50000,
      hpp_satuan: 0,
      hpp_total: 0,
      deskripsi_pekerjaan: "Banner custom",
    });
    mockTable("penjualan").set("s1", { id: "s1", nomor_faktur: "INV-001", tanggal: "2026-07-07" });
    await reconcilePendingMaklonItem("it-1", {
      vendor_subkontrak_id: "v1",
      biaya_subkontrak: 30000,
      metode_bayar_vendor: "CASH",
      dibuat_oleh: "u1",
    });
    const updated = mockTable("item_penjualan").get("it-1");
    expect(Number(updated.pending_vendor_hpp)).toBe(0);
    expect(Number(updated.hpp_total)).toBe(30000);
    const keuanganRows = mockTable("keuangan").all();
    expect(keuanganRows.some((k: any) => (k.keperluan || "").includes("[REF:it-1]"))).toBe(true);
    expect(createMaklonPurchase).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test → FAIL**

Run: `npx jest src/lib/__tests__/pos-mutations-pending-maklon.test.ts`
Expected: FAIL (service belum ada).

- [ ] **Step 3: Implementasi service `reconcilePendingMaklonItem`**

Buat `src/lib/services/pending-maklon-service.ts`:

```ts
import "server-only";
import { db, generateId, getCurrentTimestamp } from "@/lib/db-unified";
import { friendlyPgError } from "@/lib/pg-error";
import { createMaklonPurchase } from "./purchases-service"; // re-export path; cek import sebenarnya
import { resolveOpenPeriodeIdForKeuangan } from "./finance-service";
import { z } from "zod";

export const reconcilePendingMaklonInputSchema = z.object({
  vendor_subkontrak_id: z.string().min(1),
  biaya_subkontrak: z.coerce.number().finite().positive(),
  metode_bayar_vendor: z.enum(["CASH", "NET30", "TRANSFER"]),
  dibuat_oleh: z.string().nullable().optional(),
});

export async function listPendingMaklon() {
  // Join item_penjualan (pending_vendor_hpp=1) + penjualan (nomor_faktur, tanggal, pelanggan).
  const items = await db.query<any>("item_penjualan", {
    where: { pending_vendor_hpp: 1 },
  });
  if (items.error) throw friendlyPgError(items.error, "item_penjualan");
  const saleIds = [...new Set((items.data || []).map((r) => r.penjualan_id))];
  const sales = saleIds.length
    ? await db.query<any>("penjualan", { where: { id: { in: saleIds } } })
    : { data: [] };
  const saleMap = new Map((sales.data || []).map((s: any) => [s.id, s]));
  return (items.data || []).map((r) => ({
    ...r,
    nomor_faktur: saleMap.get(r.penjualan_id)?.nomor_faktur,
    tanggal: saleMap.get(r.penjualan_id)?.tanggal,
    pelanggan_nama: saleMap.get(r.penjualan_id)?.pelanggan_nama_snapshot,
  }));
}

export async function reconcilePendingMaklonItem(itemPenjualanId: string, input: z.infer<typeof reconcilePendingMaklonInputSchema>) {
  const parsed = reconcilePendingMaklonInputSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;
  await db.transaction(async () => {
    const cur = await db.queryOne<any>("item_penjualan", { where: { id: itemPenjualanId } });
    if (!cur.data) throw new Error("Item penjualan tidak ditemukan");
    if (Number(cur.data.pending_vendor_hpp) !== 1) throw new Error("Item bukan pending maklon");
    const biaya = data.biaya_subkontrak;
    const hppSatuan = cur.data.jumlah > 0 ? biaya / cur.data.jumlah : biaya;
    const hppTotal = biaya;
    const grossProfit = (cur.data.subtotal || 0) - hppTotal;
    const grossMargin = cur.data.subtotal > 0 ? (grossProfit / cur.data.subtotal) * 100 : 0;
    const upd = await db.update("item_penjualan", itemPenjualanId, {
      vendor_subkontrak_id: data.vendor_subkontrak_id,
      biaya_subkontrak: biaya,
      metode_bayar_vendor: data.metode_bayar_vendor,
      hpp_satuan: hppSatuan,
      hpp_total: hppTotal,
      gross_profit: grossProfit,
      gross_margin: grossMargin,
      pending_vendor_hpp: 0,
    });
    if (upd.error) throw upd.error;

    // Post HPP keuangan [REF:itemPenjualanId].
    const periodeId = await resolveOpenPeriodeIdForKeuangan();
    const saleRow = await db.queryOne<any>("penjualan", { where: { id: cur.data.penjualan_id } });
    const keperluan = `HPP Maklon ${saleRow.data?.nomor_faktur || ""} [REF:${itemPenjualanId}]`;
    const maxOrder = await db.query<any>("keuangan", { orderBy: { column: "urutan_tampilan", ascending: false }, limit: 1 });
    const nextOrder = (maxOrder.data?.[0]?.urutan_tampilan || 0) + 1;
    const finResult = await db.insert("keuangan", {
      id: generateId("keu"),
      tanggal: saleRow.data?.tanggal || getCurrentTimestamp(),
      kategori_transaksi: "HPP_MAKLON",
      debit: hppTotal, kredit: 0,
      keperluan,
      biaya_bahan: 0,
      catatan: `Reconcile pending maklon ${saleRow.data?.nomor_faktur || ""}`,
      dibuat_oleh: data.dibuat_oleh || null,
      urutan_tampilan: nextOrder,
      reference_type: "HPP_MAKLON",
      reference_id: itemPenjualanId,
      periode_id: periodeId,
    });
    if (finResult.error) throw finResult.error;
  });

  // Buat PO maklon di luar transaksi (sama pola createSaleAttempt L1026).
  const cur = await db.queryOne<any>("item_penjualan", { where: { id: itemPenjualanId } });
  const saleRow = await db.queryOne<any>("penjualan", { where: { id: cur.data?.penjualan_id } });
  await createMaklonPurchase({
    saleId: cur.data!.penjualan_id,
    saleInvoiceNumber: saleRow.data?.nomor_faktur || "",
    vendorId: data.vendor_subkontrak_id,
    metodeBayar: data.metode_bayar_vendor,
    tanggal: saleRow.data?.tanggal || getCurrentTimestamp().slice(0, 10),
    dibuatOleh: data.dibuat_oleh || null,
    items: [{
      deskripsi_pekerjaan: cur.data!.deskripsi_pekerjaan || "",
      jumlah: cur.data!.jumlah,
      biaya_subkontrak: biaya,
    }],
  });
}
```

Catatan: cek nama import `createMaklonPurchase` (`@/lib/services/purchases-service` re-export atau `purchases-mutations`), `resolveOpenPeriodeIdForKeuangan` lokasi (di `finance-service.ts` — grep dulu). `kategori_transaksi` "HPP_MAKLON" konsisten dengan enum keuangan (cek/ samakan dengan yang ada). Pastikan tidak ada closed-period bypass — panggil `isDateInClosedPeriod` untuk `tanggal` sale (iron rule 7). Kalau closed, throw friendly error.

- [ ] **Step 4: Tambah actions di `src/app/katalog-maklon/actions.ts`**

```ts
import { requireOperationalRole } from "@/lib/auth-guard-server";
import { listPendingMaklon, reconcilePendingMaklonItem, reconcilePendingMaklonInputSchema } from "@/lib/services/pending-maklon-service";

export async function listPendingMaklonAction() {
  await requireSession();
  return listPendingMaklon();
}

export async function reconcilePendingMaklonItemAction(itemPenjualanId: string, input: z.infer<typeof reconcilePendingMaklonInputSchema>) {
  const s = await requireOperationalRole(); // Staf+ boleh reconcile
  return reconcilePendingMaklonItem(itemPenjualanId, { ...input, dibuat_oleh: s.uid });
}
```

Tambah `import { requireSession } from "@/lib/auth-guard-server";` + `import { z } from "zod";`.

- [ ] **Step 5: Run test → PASS**

Run: `npx jest src/lib/__tests__/pos-mutations-pending-maklon.test.ts`
Expected: PASS (3 test total).

- [ ] **Step 6: Buat modal + section di `page.tsx`**

Buat `src/app/katalog-maklon/ModalReconcilePendingMaklon.tsx` (ModalFormShell, 3 field: vendor select, biaya number, metode select CASH/NET30/TRANSFER, tombol Reconcile async). Di `src/app/katalog-maklon/page.tsx`, tambah section/tab **"Pending Vendor/HPP"**:

- `const { data: pendingData, mutate: mutatePending } = useCachedData("pending-maklon-v1", listPendingMaklonAction);`
- Tabel: faktur, tanggal, nama item (`deskripsi_pekerjaan`), jumlah, harga jual, tombol "Isi Vendor & HPP" → buka `ModalReconcilePendingMaklon`.
- Setelah reconcile sukses → `mutatePending()` + `invalidate("keuangan")` + `invalidate("penjualan")`.

Ganti icon "Populer" di header section pakai SVG dari `ContentIcons` (jangan emoji).

- [ ] **Step 7: Run type-check + build**

Run: `npm run type-check && npm run build`
Expected: 0 error.

- [ ] **Step 8: Commit**

```bash
git add src/lib/services/pending-maklon-service.ts src/app/katalog-maklon/actions.ts src/app/katalog-maklon/page.tsx src/app/katalog-maklon/ModalReconcilePendingMaklon.tsx src/lib/__tests__/pos-mutations-pending-maklon.test.ts
git commit -m "feat(katalog): queue Pending Vendor/HPP + reconcile (update HPP, post keuangan, buat PO maklon)"
```

---

### Task 6: C3 — `handleProdukJualClick` KATALOG_MAKLON set virtual material + form adaptasi + `buildCartItemFromForm` maklon + edit alihkan ke form

**Files:**
- Modify: `src/app/pos/pos-types.ts` — `Material` tambah `_isKatalogMaklon?`, `_katalogMaklonId?`; `UnitPrice` tambah field virtual bila perlu.
- Modify: `src/app/pos/page.tsx` (`handleProdukJualClick` L641-668, `buildCartItemFromForm` L600-638, `handleEditCartItem` L707-715, form area L1806-1865 + L1867-1900)

**Interfaces:**
- Consumes: `ID_BARANG_PLACEHOLDER_MAKLON` + `ID_HARGA_PLACEHOLDER_MAKLON` dari `src/lib/barang-placeholder.ts`. `katalogMaklon` data.
- Produces: klik katalog extra → form muncul (qty/harga/biaya tambahan, TANPA finishing/roll). `buildCartItemFromForm` buat CartItem MAKLON dengan `katalog_maklon_id`. Edit maklon → form (bukan ModalRincianInternal).

- [ ] **Step 1: Tambah field virtual di type `Material`**

Edit `src/app/pos/pos-types.ts` `Material` (L30-38):

```ts
export interface Material {
  id: string;
  nama: string;
  butuh_dimensi_status: number;
  frekuensi_terjual: number;
  muncul_di_pos_status?: number;
  kategori_nama?: string;
  unit_prices: UnitPrice[];
  // Flag virtual: true bila material ini adalah proxy untuk entri katalog_maklon
  // (TIDAK ada di tabel barang asli). Dipakai form POS untuk hide finishing/roll.
  _isKatalogMaklon?: boolean;
  _katalogMaklonId?: string;
}
```

- [ ] **Step 2: Ubah `handleProdukJualClick` — set virtual material, jangan langsung ke cart**

Edit `src/app/pos/page.tsx` L641-668:

Before:
```ts
if (produk.sumber === "KATALOG_MAKLON") {
  const vendor = subkontraktor.find((v) => v.id === produk.vendor_subkontrak_id_default);
  const newItem: CartItem = { /* ... langsung ke cart ... */ };
  setCart((prev) => [...prev, newItem]);
  return;
}
```
After:
```ts
if (produk.sumber === "KATALOG_MAKLON") {
  // Set virtual material + unit supaya form Pilih Barang muncul (C3).
  // Form tampilkan qty + ubah harga + biaya tambahan, TANPA finishing/roll.
  setSelectedMaterial({
    id: ID_BARANG_PLACEHOLDER_MAKLON,
    nama: produk.barang_nama ?? produk.nama,
    butuh_dimensi_status: 0, // maklon tidak berdimensi
    frekuensi_terjual: 0,
    _isKatalogMaklon: true,
    _katalogMaklonId: produk.katalog_maklon_id,
    unit_prices: [],
  });
  setSelectedUnit({
    id: ID_HARGA_PLACEHOLDER_MAKLON,
    nama_satuan: produk.nama_satuan,
    nama_produk_jual: produk.nama_produk_jual ?? null,
    faktor_konversi: 1,
    harga_jual: produk.harga_jual,
    harga_member: produk.harga_member ?? produk.harga_jual,
    default_status: 1,
  });
  setPanjang("");
  setLebar("");
  setQuantity("1");
  setUseRounding(false);
  setSelectedRollSize(null);
  setFormFinishing([]);          // maklon tidak ada finishing
  setFormHargaSatuan(null);
  setFormBiayaTambahan([]);
  setEditingCartIndex(null);
  return;
}
```

- [ ] **Step 3: Adaptasi form area — hide finishing + roll untuk maklon**

Edit form area L1806-1865 (dimensions) dan L1867-1900 (finishing). Bungkus dengan cek `selectedMaterial._isKatalogMaklon`:

```tsx
{/* Dimensions — HANYA untuk barang berdimensi, bukan maklon */}
{selectedMaterial.butuh_dimensi_status === 1 && !selectedMaterial._isKatalogMaklon && (
  <div className="space-y-2"> {/* ... ukuran + roll ... */} </div>
)}

{/* Finishing — sembunyikan untuk maklon (outsourced, tidak relevan) */}
{!selectedMaterial._isKatalogMaklon && (
  <button type="button" onClick={() => setShowFormFinishingModal(true)} /* ... */>
    {/* + Finishing */}
  </button>
)}
```

Biaya tambahan + ubah harga tetap tampil untuk maklon. Satuan select (L1783-1802) — untuk maklon `selectedMaterial.unit_prices` kosong, jadi ganti jadi tampilkan nama satuan statis bila `_isKatalogMaklon`:

```tsx
{selectedMaterial._isKatalogMaklon ? (
  <div className="px-3 py-2 text-sm text-gray-600 dark:text-slate-300">
    {selectedUnit?.nama_satuan} (maklon)
  </div>
) : (
  <select /* ... */> {/* existing unit select */} </select>
)}
```

- [ ] **Step 4: `buildCartItemFromForm` — branch maklon**

Edit L600-638. Deteksi `selectedMaterial._isKatalogMaklon` dan return CartItem MAKLON:

```ts
// Setelah hitung hargaPerSatuan/subtotalRaw/validFormBiayaTambahan (L602-613):
if (selectedMaterial._isKatalogMaklon) {
  return {
    barang_id: ID_BARANG_PLACEHOLDER_MAKLON,
    barang_nama: selectedMaterial.nama,
    harga_satuan_id: ID_HARGA_PLACEHOLDER_MAKLON,
    nama_satuan: selectedUnit!.nama_satuan,
    faktor_konversi: 1,
    harga_satuan: hargaPerSatuan,
    jumlah: finalQuantity,
    subtotalRaw,
    originalHargaSatuan: hargaKatalog,
    biaya_tambahan: validFormBiayaTambahan.length > 0 ? validFormBiayaTambahan : undefined,
    tipe_item: "MAKLON",
    katalog_maklon_id: selectedMaterial._katalogMaklonId,
    deskripsi_pekerjaan: selectedMaterial.nama,
    // vendor/biaya/metode TIDAK di-set di sini — di-isi via Rincian Internal
    // atau pending jika kosong → safeguard C2.
  };
}
// ... existing barang return ...
```

Catatan: `butuh_dimensi`/`panjang`/`lebar`/`useRounding`/`selectedRollSize` tidak di-set untuk maklon.

- [ ] **Step 5: `handleEditCartItem` — alihkan maklon ke form, bukan ModalRincianInternal**

Edit L707-715:

Before:
```ts
if (item.tipe_item === "MAKLON") {
  setEditingRincianInternalIndex(index);
  return;
}
```
After:
```ts
if (item.tipe_item === "MAKLON" && !item.katalog_maklon_id) {
  // Ad-hoc maklon (dari ModalTambahItemLainnya lama, belum masuk katalog) tetap
  // lewat modal rincian internal untuk vendor/biaya.
  setEditingRincianInternalIndex(index);
  return;
}
if (item.tipe_item === "MAKLON" && item.katalog_maklon_id) {
  // Katalog extra: edit qty/harga/biaya tambahan lewat form Pilih Barang (C3).
  // Cari entri katalog_maklon di katalogMaklon → set virtual material + unit.
  const km = katalogMaklon.find((k) => k.id === item.katalog_maklon_id);
  setSelectedMaterial({
    id: ID_BARANG_PLACEHOLDER_MAKLON,
    nama: item.barang_nama,
    butuh_dimensi_status: 0,
    frekuensi_terjual: 0,
    _isKatalogMaklon: true,
    _katalogMaklonId: item.katalog_maklon_id,
    unit_prices: [],
  });
  setSelectedUnit({
    id: ID_HARGA_PLACEHOLDER_MAKLON,
    nama_satuan: item.nama_satuan,
    nama_produk_jual: km?.nama_produk ?? null,
    faktor_konversi: 1,
    harga_jual: km?.harga_jual_default ?? item.harga_satuan,
    harga_member: km?.harga_jual_default ?? item.harga_satuan,
    default_status: 1,
  });
  setEditingCartIndex(index);
  setQuantity(String(item.jumlah));
  setFormHargaSatuan(item.harga_satuan !== (item.originalHargaSatuan ?? item.harga_satuan) ? item.harga_satuan : null);
  setFormBiayaTambahan(item.biaya_tambahan ? item.biaya_tambahan.map((b) => ({ ...b })) : []);
  setFormFinishing([]);
  return;
}
```

Catatan: vendor/biaya/metode untuk katalog extra diedit lewat collapsed "Rincian Internal" section di form (tambah di Step 3 area, bila scope MVP butuh). Untuk MVP minimal, vendor/biaya bisa dibiarkan pending → reconcile di Task 5. Tambahkan catatan: bila owner butuh edit vendor inline, buka `ModalRincianInternalMaklon` via tombol terpisah (opsional, out-of-scope MVP).

- [ ] **Step 6: Run type-check + build**

Run: `npm run type-check && npm run build`
Expected: 0 error. (Tidak ada unit test baru — C3 adalah UI flow; validasi manual di task 9.)

- [ ] **Step 7: Commit**

```bash
git add src/app/pos/pos-types.ts src/app/pos/page.tsx
git commit -m "feat(pos): katalog extra lewat flow Pilih Barang (form qty/harga/biaya, tanpa finishing/roll)"
```

---

### Task 7: C6 — `katalog_maklon.kategori_id` FK + service join `kategori_nama` + modal dropdown + POS `materialCategories` include katalog

**Files:**
- Modify: `src/lib/services/katalog-maklon-service.ts` (`listKatalogMaklon` join, interface sudah di Task 2)
- Modify: `src/lib/schemas/katalog-maklon.ts` (`kategori_id` sudah di Task 2)
- Modify: `src/app/katalog-maklon/ModalKatalogMaklon.tsx` (L219-232 input → select; init fetch kategori)
- Modify: `src/app/katalog-maklon/actions.ts` — `getKategoriBarangAction`.
- Modify: `src/app/pos/page.tsx` (`produkJualList` L450-465 `kategori_nama` dari join; `materialCategories` L410-424 include katalog)
- Test: tambah ke `src/lib/__tests__/katalog-maklon-service-extra.test.ts` (join `kategori_nama`).

**Interfaces:**
- Consumes: kolom `kategori_id` + FK (Task 1). `getMaterialCategories()` di `materials-service.ts` L577.
- Produces: modal pakai dropdown kategori. POS `produkJualList.kategori_nama` dari join `kategori_id`. Filter chip kategori include katalog.

- [ ] **Step 1: Tulis failing test**

Tambah ke `src/lib/__tests__/katalog-maklon-service-extra.test.ts`:

```ts
it("listKatalogMaklon mengembalikan kategori_nama dari join kategori_id", async () => {
  mockTable("kategori_barang").set("kat-1", { id: "kat-1", nama: "Banner" });
  await createKatalogMaklon({
    nama_produk: "Banner Join",
    nama_satuan: "pcs",
    harga_jual_default: 1000,
    biaya_subkontrak_default: 0,
    kategori_id: "kat-1",
    popuer_status: 0,
    is_aktif: 1,
  } as any, "u1");
  const list = await listKatalogMaklon(false);
  const found = list.find((k) => k.nama_produk === "Banner Join");
  expect(found?.kategori_id).toBe("kat-1");
  expect(found?.kategori_nama).toBe("Banner");
});
```

- [ ] **Step 2: Run test → FAIL**

Run: `npx jest src/lib/__tests__/katalog-maklon-service-extra.test.ts`
Expected: FAIL (`kategori_nama` tidak di-join).

- [ ] **Step 3: Update `listKatalogMaklon` join**

Edit `src/lib/services/katalog-maklon-service.ts` `listKatalogMaklon` (L25-31):

```ts
export async function listKatalogMaklon(onlyAktif = true): Promise<KatalogMaklon[]> {
  const result = await db.query<KatalogMaklonRow & { kategori_nama?: string | null }>("katalog_maklon", {
    orderBy: { column: "popuer_status", ascending: false }, // populer dulu, lalu nama
  });
  if (result.error) throw friendlyPgError(result.error, "katalog_maklon");
  const rows = (result.data || []).filter((r) => Number(r.is_deleted) !== 1 && (!onlyAktif || Number(r.is_aktif) === 1));
  // Join kategori_nama di memory (N+1 kecil; tabel kategori_barang bounded).
  const kategoriIds = [...new Set(rows.map((r) => r.kategori_id).filter(Boolean) as string[])];
  const kategoriMap = new Map<string, string>();
  if (kategoriIds.length) {
    const katRes = await db.query<{ id: string; nama: string }>("kategori_barang", {
      where: { id: { in: kategoriIds } },
    });
    for (const k of katRes.data || []) kategoriMap.set(k.id, k.nama);
  }
  return rows.map((r) => ({ ...r, kategori_nama: r.kategori_id ? kategoriMap.get(r.kategori_id) ?? null : null }));
}
```

Catatan: ganti `orderBy urutan` → `orderBy popuer_status DESC` (C5). `db.query ... where in` — verifikasi `db-unified` support `{ in: [...] }` (iron rule 19 reference). Kalau tidak, fetch all `kategori_barang` (bounded) lalu map.

- [ ] **Step 4: Tambah `getKategoriBarangAction`**

Di `src/app/katalog-maklon/actions.ts`:

```ts
import { getMaterialCategories } from "@/lib/services/materials-service";
import { requireSession } from "@/lib/auth-guard-server";

export async function getKategoriBarangAction() {
  await requireSession();
  return getMaterialCategories();
}
```

- [ ] **Step 5: Modal — ganti input free-text → dropdown**

Edit `src/app/katalog-maklon/ModalKatalogMaklon.tsx` L219-232. Fetch kategori via `useCachedData("kategori-barang", getKategoriBarangAction)` (atau lewat props dari parent). Ganti:

```tsx
<select
  value={form.kategori_id ?? ""}
  onChange={(e) => setForm({ ...form, kategori_id: e.target.value || null, kategori: e.target.options[e.target.selectedIndex].text })}
  className="..."
>
  <option value="">— Tanpa kategori —</option>
  {kategoriBarang.map((k) => (
    <option key={k.id} value={k.id}>{k.nama}</option>
  ))}
</select>
```

Catatan: tetap simpan `kategori` (free-text) untuk backwards-compat — sinkron dengan nama yang dipilih (`e.target.options[...].text`). Field `kategori` di schema tetap ada (legacy).

- [ ] **Step 6: POS — `produkJualList.kategori_nama` dari join + `materialCategories` include katalog**

Edit `src/app/pos/page.tsx` L450-465 (loop `katalogMaklon`):
```ts
kategori_nama: k.kategori_nama ?? k.kategori ?? null, // join kategori_id (C6), fallback legacy
```

Edit L410-424 `materialCategories` — tambah iterasi katalog:
```ts
const materialCategories = useMemo(() => {
  const names = new Set<string>();
  for (const m of materials) {
    if (m.id === ID_BARANG_PLACEHOLDER_MAKLON) continue;
    if (m.kategori_nama) names.add(m.kategori_nama);
  }
  for (const k of katalogMaklon) {
    if (k.kategori_nama) names.add(k.kategori_nama);
  }
  return [...names].sort(/* ...existing KATEGORI_ORDER logic... */);
}, [materials, katalogMaklon]);
```

- [ ] **Step 7: Run test → PASS**

Run: `npx jest src/lib/__tests__/katalog-maklon-service-extra.test.ts`
Expected: PASS (3 test).

- [ ] **Step 8: Run type-check + build**

Run: `npm run type-check && npm run build`
Expected: 0 error.

- [ ] **Step 9: Commit**

```bash
git add src/lib/services/katalog-maklon-service.ts src/app/katalog-maklon/ModalKatalogMaklon.tsx src/app/katalog-maklon/actions.ts src/app/pos/page.tsx src/lib/__tests__/katalog-maklon-service-extra.test.ts
git commit -m "feat(katalog,pos): kategori_id FK + join kategori_nama + dropdown + filter chip katalog"
```

---

### Task 8: C5 — `getPopularItemsAction` + POS `sortPopuler` + badge toggle + `ModalKatalogMaklon` checkbox Populer + `PanelHargaSatuan` checkbox

**Files:**
- Modify: `src/app/pos/actions.ts` — `getPopularItemsAction`.
- Modify: `src/app/pos/page.tsx` (state `sortPopuler`, badge L1638-1647 jadi button toggle, sort `filteredProdukJual` L470-486, fetch popularitas).
- Modify: `src/app/katalog-maklon/ModalKatalogMaklon.tsx` (L328-345 ganti "Urutan Tampil" → checkbox "Tandai Populer").
- Modify: `src/components/barang/PanelHargaSatuan.tsx` — checkbox Populer per produk jual.
- Modify: `src/components/barang/types-barang.ts` — `UnitPrice.popuer_status?: number`.
- Test: `src/lib/__tests__/get-popular-items.test.ts` (TDD auto-compute + manual override).

**Interfaces:**
- Consumes: `popuer_status` di `harga_barang_satuan` + `katalog_maklon` (Task 1); `item_penjualan.katalog_maklon_id` + `harga_satuan_id` + `tipe_item` (Task 1/4).
- Produces: `getPopularItemsAction` return `{ barangUnitPriceIds: Set, katalogMaklonIds: Set }`. POS sort populer ke depan bila toggle ON. Modal + panel checkbox set `popuer_status`.

- [ ] **Step 1: Tulis failing test untuk `getPopularItemsAction`**

Buat `src/lib/__tests__/get-popular-items.test.ts`:

```ts
import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return { db: real.__mock.db, generateId: real.__mock.generateId, getCurrentTimestamp: real.__mock.getCurrentTimestamp };
});
jest.mock("@/lib/auth-guard-server", () => ({ __esModule: true, requireSession: jest.fn(async () => ({ uid: "u1", role: "staff" })) }));

import { getPopularItemsAction } from "@/app/pos/actions";

beforeEach(() => resetMockDb());

describe("getPopularItemsAction", () => {
  it("auto-compute: barang >= 3 transaksi 30 hari → populer", async () => {
    const recent = new Date().toISOString();
    mockTable("item_penjualan").seed([
      { id: "i1", tipe_item: "BARANG", harga_satuan_id: "up1", dibuat_pada: recent },
      { id: "i2", tipe_item: "BARANG", harga_satuan_id: "up1", dibuat_pada: recent },
      { id: "i3", tipe_item: "BARANG", harga_satuan_id: "up1", dibuat_pada: recent },
      { id: "i4", tipe_item: "MAKLON", katalog_maklon_id: "km1", dibuat_pada: recent },
    ]);
    const r = await getPopularItemsAction();
    expect(r.barangUnitPriceIds.has("up1")).toBe(true);
    expect(r.katalogMaklonIds.has("km1")).toBe(false); // hanya 1 transaksi < 3
  });

  it("manual override: popuer_status=1 selalu populer walau 0 transaksi", async () => {
    mockTable("harga_barang_satuan").set("up9", { id: "up9", popuer_status: 1, is_deleted: false });
    mockTable("katalog_maklon").set("km9", { id: "km9", popuer_status: 1, is_deleted: 0 });
    const r = await getPopularItemsAction();
    expect(r.barangUnitPriceIds.has("up9")).toBe(true);
    expect(r.katalogMaklonIds.has("km9")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test → FAIL**

Run: `npx jest src/lib/__tests__/get-popular-items.test.ts`
Expected: FAIL (action belum ada).

- [ ] **Step 3: Implementasi `getPopularItemsAction`**

Di `src/app/pos/actions.ts`:

```ts
import { requireSession } from "@/lib/auth-guard-server";
import { db } from "@/lib/db-unified";

export async function getPopularItemsAction(): Promise<{
  barangUnitPriceIds: Set<string>;
  katalogMaklonIds: Set<string>;
}> {
  await requireSession();
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  // N+1 note: db-unified where mungkin tidak support range tanggal → fetch all
  // item_penjualan lalu filter in-memory by dibuat_pada >= since. Acceptable untuk
  // MVP (~ribuan baris). Optimasi: kalau where support range, pakai itu.
  const barangSales = await db.query<any>("item_penjualan", {
    where: { tipe_item: "BARANG", harga_satuan_id: { ne: null } },
  });
  const barangCounts = new Map<string, number>();
  for (const it of barangSales.data || []) {
    if (it.dibuat_pada < since) continue;
    if (!it.harga_satuan_id) continue;
    barangCounts.set(it.harga_satuan_id, (barangCounts.get(it.harga_satuan_id) || 0) + 1);
  }

  const maklonSales = await db.query<any>("item_penjualan", {
    where: { tipe_item: "MAKLON", katalog_maklon_id: { ne: null } },
  });
  const maklonCounts = new Map<string, number>();
  for (const it of maklonSales.data || []) {
    if (it.dibuat_pada < since) continue;
    if (!it.katalog_maklon_id) continue;
    maklonCounts.set(it.katalog_maklon_id, (maklonCounts.get(it.katalog_maklon_id) || 0) + 1);
  }

  const manualBarang = await db.query<any>("harga_barang_satuan", {
    where: { popuer_status: 1, is_deleted: false },
  });
  const manualMaklon = await db.query<any>("katalog_maklon", {
    where: { popuer_status: 1, is_deleted: 0 },
  });

  const THRESHOLD = 3;
  const barangUnitPriceIds = new Set<string>([
    ...[...barangCounts.entries()].filter(([, c]) => c >= THRESHOLD).map(([id]) => id),
    ...(manualBarang.data || []).map((r: any) => r.id),
  ]);
  const katalogMaklonIds = new Set<string>([
    ...[...maklonCounts.entries()].filter(([, c]) => c >= THRESHOLD).map(([id]) => id),
    ...(manualMaklon.data || []).map((r: any) => r.id),
  ]);
  return { barangUnitPriceIds, katalogMaklonIds };
}
```

Catatan: `where: { ne: null }` / `{ in: [...] }` — verifikasi `db-unified` support operator `{ ne }`. Kalau tidak, fetch all lalu filter in-memory (catat di komentar). `is_deleted: false` untuk harga_barang_satuan (boolean di Postgres / integer di SQLite — `normalizeRecord` handle). Kalau query ambigu, pakai `Number(r.is_deleted) !== 1` di filter in-memory.

- [ ] **Step 4: Run test → PASS**

Run: `npx jest src/lib/__tests__/get-popular-items.test.ts`
Expected: PASS, 2 test.

- [ ] **Step 5: POS — state `sortPopuler` + fetch + badge toggle + sort**

Edit `src/app/pos/page.tsx`:

- Tambah state: `const [sortPopuler, setSortPopuler] = useState(false);`
- Fetch: `const { data: popularData } = useCachedData("pos-populer-v1", getPopularItemsAction);` (fallback `null` aman — sortPopuler OFF default).
- Tambah import `getPopularItemsAction` dari `./actions`.
- Helper:
```ts
const isItemPopular = (p: ProdukJualFlat): boolean => {
  if (!popularData) return false;
  if (p.sumber === "KATALOG_MAKLON") return popularData.katalogMaklonIds.has(p.katalog_maklon_id || "");
  return popularData.barangUnitPriceIds.has(p.id);
};
```
- Sort `filteredProdukJual` (L470-486): setelah filter, sort bila `sortPopuler`:
```ts
const sorted = sortPopuler
  ? [...filtered].sort((a, b) => (Number(isItemPopular(b)) - Number(isItemPopular(a))))
  : filtered;
```
Ganti `filteredProdukJual` return `sorted`. Tambah `popularData` + `sortPopuler` ke dependency array `useMemo`.
- Badge "Populer" (L1638-1647) → ganti div jadi `<button>`:
```tsx
<button
  type="button"
  onClick={() => setSortPopuler((v) => !v)}
  aria-pressed={sortPopuler}
  className={`shrink-0 text-xs px-3 py-1 rounded-full whitespace-nowrap transition-colors ${
    sortPopuler
      ? "bg-cyan-500 text-white"
      : "text-gray-500 dark:text-slate-400 bg-cyan-50 dark:bg-slate-800"
  }`}
>
  <svg className="w-3 h-3 inline mr-1" fill="currentColor" viewBox="0 0 20 20">
    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
  </svg>
  Populer {sortPopuler ? "ON" : "OFF"}
</button>
```

- [ ] **Step 6: Modal `ModalKatalogMaklon` — ganti "Urutan Tampil" → checkbox "Tandai Populer"**

Edit L328-345:
```tsx
<label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-300">
  <input
    type="checkbox"
    checked={form.popuer_status === 1}
    onChange={(e) => setForm({ ...form, popuer_status: e.target.checked ? 1 : 0 })}
    className="w-4 h-4 rounded"
  />
  Tandai Populer (muncul di atas saat filter Populer ON di POS)
</label>
```
Drop field `urutan` dari UI (kolom DB tetap untuk backwards-compat, tetap di schema default 0).

- [ ] **Step 7: `PanelHargaSatuan` — checkbox Populer per produk jual**

Edit `src/components/barang/PanelHargaSatuan.tsx` + `src/components/barang/types-barang.ts` (`UnitPrice.popuer_status?: number`). Tambah checkbox per baris produk jual yang set `up.popuer_status` lewat action update yang sudah ada (cek action barang — pakai `updateHargaSatuanAction` atau tambah field di update bulk). Bila perlu action baru `setHargaSatuanPopulerAction(id, status)` — minimal: extend action update existing untuk terima `popuer_status`.

- [ ] **Step 8: Run test + type-check + build**

Run: `npx jest src/lib/__tests__/get-popular-items.test.ts && npm run type-check && npm run build`
Expected: PASS, 0 error.

- [ ] **Step 9: Commit**

```bash
git add src/app/pos/actions.ts src/app/pos/page.tsx src/app/katalog-maklon/ModalKatalogMaklon.tsx src/components/barang/PanelHargaSatuan.tsx src/components/barang/types-barang.ts src/lib/__tests__/get-popular-items.test.ts
git commit -m "feat(pos): sistem Populer (auto-compute 30 hari + manual override) + badge sort toggle + checkbox modal"
```

---

### Task 9: Verifikasi akhir + apply migration

**Files:** (tidak ada perubahan kode — verifikasi + deploy)

- [ ] **Step 1: Run type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: 0 error. Lint warning baru (yang kita intro) harus diperbaiki.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: build sukses.

- [ ] **Step 3: Run semua jest test yang relevan**

Run:
```bash
npx jest src/lib/__tests__/pos-mutations-pending-maklon.test.ts \
         src/lib/__tests__/katalog-maklon-service-extra.test.ts \
         src/lib/__tests__/get-popular-items.test.ts \
         src/app/pos/__tests__/ModalTambahItemLainnya.test.tsx \
         src/app/katalog-maklon/__tests__/ModalKatalogMaklon.test.tsx \
         src/lib/__tests__/void-sale-side-effects.test.ts \
         src/lib/__tests__/pos
```
Expected: semua PASS.

- [ ] **Step 4: Apply migrasi ke cloud (setelah merge)**

Setelah PR merge ke `main` (Vercel auto-deploy):
```bash
npm run supabase:db:push
```
Verifikasi kolom baru ada di cloud: `pending_vendor_hpp`, `katalog_maklon_id` (item_penjualan); `popuer_status`, `kategori_id` (katalog_maklon); `popuer_status` (harga_barang_satuan); CHECK constraint menerima TRANSFER.

- [ ] **Step 5: Manual test (per spec Testing section L599-617)**

1. POS → "Tambah Item Lainnya" → isi nama+satuan+harga saja → simpan → item masuk cart + muncul di halaman Katalog Extra.
2. Checkout dengan item pending → sukses. Cek: tidak ada HPP di Keuangan, tidak ada SPK item, riwayat tampilkan badge "Pending Vendor".
3. Katalog Extra → tab "Pending Vendor/HPP" → isi vendor+biaya+metode → Reconcile → cek: HPP masuk Keuangan, PO maklon dibuat.
4. POS → klik katalog extra existing → form muncul (qty/harga/biaya tambahan, TANPA finishing) → tambah ke cart.
5. Katalog Extra modal → pilih metode TRANSFER → simpan → jual → cek keuangan post metode TRANSFER (bukan hutang).
6. POS → klik badge "Populer" → item populer sort ke atas. Tandai Populer di modal → item muncul populer walau belum ada penjualan.
7. POS → kategori katalog extra muncul di filter chip.

- [ ] **Step 6: Commit verifikasi (opsional)**

Bila ada fix lint kecil dari Step 1, commit:
```bash
git commit -am "chore(pos,katalog): fix lint dari plan C verifikasi"
```

---

## Self-Review

**Iron rules compliance:**
- ✅ Schema 3-tempat: migrasi Supabase additive `20260707000003` + `database/sqlite-schema.sql` + runtime ALTER/rebuild `db-unified.ts` (Task 1).
- ✅ Auth guard: `createKatalogMaklonAction`/`update`/`delete` = `requireAdminOrManager` (ada); `reconcilePendingMaklonItemAction` = `requireOperationalRole` (Staf+); `getPopularItemsAction` = `requireSession`; identitas dari `session.uid`.
- ✅ Zod validation: `katalogMaklonInputSchema` (TRANSFER, kategori_id, popuer_status); `reconcilePendingMaklonInputSchema`.
- ✅ Money/ledger: reconcile post HPP `keuangan` dengan `[REF:itemPenjualanId]`; `createMaklonPurchase` TRANSFER = CASH (post keuangan, bukan hutang); NET30 tetap hutang.
- ✅ `useCachedData` untuk semua fetch client (`katalog-maklon`, `pending-maklon-v1`, `pos-populer-v1`, `kategori-barang`). `useInvalidate` bust cross-page.
- ✅ `db.query/queryOne/insert/update/transaction` — tidak import client Supabase/SQLite langsung.
- ✅ Closed-period guard: reconcile cek `isDateInClosedPeriod` untuk `tanggal` sale (iron rule 7) — catat di Task 5 Step 3.
- ✅ Bahasa Indonesia UI/komentar baru. Icons SVG (bukan emoji) — badge Populer pakai SVG star existing.
- ✅ Dark mode: badge toggle + section + modal semuanya `dark:` pair.

**TDD coverage:**
- `pos-mutations-pending-maklon.test.ts` — pending maklon (skip PO/SPK, `pending_vendor_hpp=1`, hpp=0) + reconcile.
- `katalog-maklon-service-extra.test.ts` — TRANSFER, kategori_id, popuer_status, join kategori_nama.
- `get-popular-items.test.ts` — auto-compute + manual override.
- `ModalTambahItemLainnya.test.tsx` — simpan tanpa vendor/biaya.
- `ModalKatalogMaklon.test.tsx` — dropdown kategori, checkbox Populer, opsi TRANSFER.

**Cross-dependency:** Plan B (cabang BARANG HPP BOM) dan plan C (cabang MAKLON pending) beda blok di `createSaleAttempt` → aman paralel/berurutan. Task 2 & 4 sentuh `pos-mutations.ts` (validasi + grouping), Task B sentuh L588-602 → koordinasi agent.

**Risk/Notes:**
- **`createMaklonPurchase` perlu perubahan kecil** (Task 2 Step 6): lebbar tipe + validasi + 3 cabang `=== "CASH"` → `isLunas`. TRANSFER = CASH behavior (post keuangan, metode_pembayaran="TRANSFER", LUNAS, no hutang).
- **SQLite CHECK constraint** tidak bisa di-ALTER → table-rebuild `item_penjualan` + `katalog_maklon` (Task 1 Step 3), ikuti pola `harga_barang_satuan` rebuild. Idempoten via `sqlite_master` sql LIKE cek.
- **N+1 `getPopularItemsAction`**: fetch all `item_penjualan` lalu filter tanggal in-memory (MVP acceptable, ~ribuan baris). Catat di komentar; optimasi kalau `db-unified` support range `where`.
- **`popuer_status_cache` SKIP** (spec C2.a) — tidak dipakai C5.b (compute on-the-fly).
- **C3 edit vendor/biaya inline** katalog extra: MVP minimal via pending→reconcile (Task 5). Edit inline lewat "Rincian Internal" section di form opsional/out-of-scope.
- **`kategori` free-text tetap di DB** (backwards-compat) — UI pakai `kategori_id`; `produkJualList.kategori_nama` fallback ke `k.kategori` legacy bila join null.
- **`urutan` tetap di DB/schema** (backwards-compat) — UI diganti Populer; `listKatalogMaklon` orderBy `popuer_status DESC`.
- **Migrasi data free-text → id** (C6 Step 1) best-effort match `kategori = kategori_barang.nama`. Sisa yang tidak match → `kategori_id` null (tidak throw).

**Out of scope (per spec L617-624):** auto-reconcile AI, retroactive SPK item creation saat reconcile, multi-vendor per katalog, threshold configurable, hapus kolom `urutan`/`kategori` legacy.