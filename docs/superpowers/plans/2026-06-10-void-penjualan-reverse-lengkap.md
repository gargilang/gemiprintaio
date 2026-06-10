# Void Penjualan — Reverse Semua Efek Samping (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Komunikasi ke owner dalam Bahasa Indonesia.

**Goal:** Saat penjualan di-void, SETIAP efek samping yang dibuat `createSale` ikut ter-reverse — bukan cuma SPK (sudah), tapi juga: keuangan VOIDED benar-benar hilang dari ledger web + tidak dihitung, SPK DIBATALKAN tidak bisa "dihidupkan" lagi lewat editor status, dan NSFP (nomor seri faktur pajak) dilepas balik ke TERSEDIA.

**Architecture:** App punya 3 storage backend. Void berjalan via dua jalur: (a) RPC Postgres `void_sale_with_inventory` (jalur web/Supabase) dan (b) fungsi TS `voidSale` (jalur SQLite/Tauri). Setiap perbaikan logika void HARUS diterapkan di KEDUA jalur agar konsisten. Perbaikan tampilan keuangan ada di read-path web (`server-data-supabase.ts` + route SQLite fallback). Guard SPK ada di `production-service.ts`.

**Tech Stack:** PostgreSQL (Supabase, plpgsql RPC), SQLite (`better-sqlite3`), TypeScript, Next.js App Router, Jest (project `node` + `jsdom`).

---

## Konteks masalah (hasil investigasi, sudah terbukti)

Owner mem-void penjualan `INV-20260610-001`. Migrasi `20260613000000_void_sale_cancel_production.sql` (perbaikan agen sebelumnya) **sudah diterapkan ke DB lokal** di sesi ini dan SPK kini ikut DIBATALKAN. Tapi tiga celah tersisa, terbukti lewat pembacaan kode:

1. **Keuangan web masih menampilkan & menghitung baris VOIDED.** Jalur web membaca via `fetchKeuanganCashBookListActive()` (`src/lib/server-data-supabase.ts:16-29`) yang hanya memfilter `diarsipkan_pada IS NULL` — TIDAK memfilter `status_transaksi = 'VOIDED'`. Fallback SQLite di `src/app/api/keuangan/cash-book/route.ts:36-41` juga tidak. Padahal service `getCashBookEntries()` (`finance-service.ts:61-63`) sudah memfilter VOIDED — tapi route web tidak memakai service itu. Akibatnya baris omzet/HPP/piutang dari penjualan yang sudah di-void tetap muncul di ledger dan ikut perhitungan.

2. **SPK DIBATALKAN bisa dihidupkan lagi.** `updateProductionOrderStatus` (`production-service.ts:582-607`) dan `updateProductionItemStatus` (:903) menulis status apa pun tanpa guard. Order yang sudah DIBATALKAN karena penjualannya VOIDED bisa diubah balik ke MENUNGGU/PROSES. (Persis keluhan owner.)

3. **NSFP tidak dilepas saat void.** `createSale` mengunci NSFP `TERSEDIA → TERPAKAI` (`pos-mutations.ts:520-551`). `compensateFailedSale` melepasnya kembali (:295-315). Tapi `voidSale` (jalur SQLite, :1120-1228) maupun RPC `void_sale_with_inventory` TIDAK menyentuh `nsfp_pool` sama sekali (grep `nsfp` di migrasi void = 0 match). Akibatnya nomor faktur pajak "hangus" TERPAKAI walau penjualannya batal.

## Yang SUDAH benar (jangan diutak-atik)

- Inventori: void sudah posting `SALE_VOID` membalik `SALE_ISSUE` (RPC & TS).
- SPK soft-cancel: order + item → DIBATALKAN (RPC & TS, via migrasi 20260613000000).
- Piutang: di-nol-kan + status LUNAS saat void.
- Guard void: tolak void bila SPK sudah PROSES/PRINTING/FINISHING/SELESAI, dan bila piutang sudah ada pelunasan.

## File Structure

- Modify: `src/lib/server-data-supabase.ts` — `fetchKeuanganCashBookListActive()` filter VOIDED (read-path web).
- Modify: `src/app/api/keuangan/cash-book/route.ts` — fallback SQLite raw SQL filter VOIDED.
- Modify: `src/lib/services/production-service.ts` — guard di `updateProductionOrderStatus` + `updateProductionItemStatus` agar order yang penjualannya VOIDED tidak bisa dihidupkan.
- Modify: `src/lib/services/pos-mutations.ts` — `voidSale` (jalur SQLite) lepas NSFP TERPAKAI→TERSEDIA.
- Create: `supabase/migrations/20260614000000_void_sale_release_nsfp.sql` — RPC `void_sale_with_inventory` (jalur web) lepas NSFP. (Migrasi baru, additive; jangan edit migrasi lama.)
- Test: `src/lib/__tests__/void-sale-side-effects.test.ts` — unit test guard SPK + NSFP release jalur TS.

## Tasks

### Task 1: Keuangan web tidak lagi menampilkan/menghitung baris VOIDED

**Files:**
- Modify: `src/lib/server-data-supabase.ts:16-29` (`fetchKeuanganCashBookListActive`)
- Modify: `src/app/api/keuangan/cash-book/route.ts:36-41` (fallback SQLite raw SQL)

- [ ] **Step 1: Tambah filter VOIDED di jalur Supabase**

Di `fetchKeuanganCashBookListActive`, tambahkan filter agar baris VOIDED tidak ikut terambil. PostgREST: gunakan `.or` untuk menerima baris yang `status_transaksi` NULL (legacy) atau bukan VOIDED.

```ts
const { data, error } = await sb
  .from("keuangan")
  .select("*")
  .is("diarsipkan_pada", null)
  .or("status_transaksi.is.null,status_transaksi.neq.VOIDED")
  .order("urutan_tampilan", { ascending: false })
  .order("dibuat_pada", { ascending: false });
```

- [ ] **Step 2: Tambah filter VOIDED di fallback SQLite**

Di `route.ts`, ubah raw SQL agar mengecualikan VOIDED (kolom bisa NULL pada baris lama):

```ts
const cashBooks =
  (await db.queryRaw(
    `SELECT * FROM keuangan
     WHERE diarsipkan_pada IS NULL
       AND COALESCE(status_transaksi, 'POSTED') <> 'VOIDED'
     ORDER BY urutan_tampilan DESC, dibuat_pada DESC`,
    []
  )) || [];
```

- [ ] **Step 3: Verifikasi manual**

Run: `npm run type-check`
Expected: 0 error. Lalu di app: void sebuah penjualan, buka /keuangan — baris OMZET/HPP/PIUTANG penjualan itu hilang dari ledger dan kartu saldo tidak lagi menghitungnya.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server-data-supabase.ts src/app/api/keuangan/cash-book/route.ts
git commit -m "fix(keuangan): sembunyikan transaksi VOIDED dari ledger web + SQLite"
```

---

### Task 2: SPK yang penjualannya VOIDED tidak bisa dihidupkan lagi

**Files:**
- Modify: `src/lib/services/production-service.ts:582-607` (`updateProductionOrderStatus`)
- Modify: `src/lib/services/production-service.ts:903+` (`updateProductionItemStatus`)
- Test: `src/lib/__tests__/void-sale-side-effects.test.ts`

- [ ] **Step 1: Tulis test gagal lebih dulu (TDD)**

Buat `src/lib/__tests__/void-sale-side-effects.test.ts`. Pola mock mengikuti `stock-opname-service.test.ts`.

```ts
import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
  };
});

import { updateProductionOrderStatus } from "../services/production-service";

beforeEach(() => resetMockDb());

test("tolak hidupkan order DIBATALKAN milik penjualan VOIDED", async () => {
  mockTable("penjualan").set("S1", { id: "S1", status_transaksi: "VOIDED" });
  mockTable("order_produksi").set("OP1", {
    id: "OP1", penjualan_id: "S1", status: "DIBATALKAN",
  });
  await expect(updateProductionOrderStatus("OP1", "MENUNGGU")).rejects.toThrow(
    /penjualan.*dibatalkan|VOIDED|tidak bisa/i
  );
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `npx jest void-sale-side-effects -t "tolak hidupkan order"`
Expected: FAIL (status masih bisa diubah karena belum ada guard).

- [ ] **Step 3: Tambah guard di `updateProductionOrderStatus`**

Di awal fungsi (sebelum menyusun `updateData`), tolak transisi keluar dari DIBATALKAN bila penjualan induk VOIDED:

```ts
const orderRes = await db.queryOne<any>("order_produksi", { where: { id } });
const order = orderRes.data;
if (order && order.status === "DIBATALKAN" && status !== "DIBATALKAN") {
  const saleRes = await db.queryOne<any>("penjualan", {
    where: { id: order.penjualan_id },
  });
  if (saleRes.data?.status_transaksi === "VOIDED") {
    throw new Error(
      "SPK ini dibatalkan karena penjualannya sudah dibatalkan (VOID). " +
        "Status tidak bisa diubah lagi."
    );
  }
}
```

- [ ] **Step 4: Tambah guard setara di `updateProductionItemStatus`**

Sebelum menulis status item, ambil order pemiliknya lalu terapkan cek yang sama:

```ts
const cur = await db.queryOne<any>("item_produksi", { where: { id: itemId } });
if (cur.data?.status === "DIBATALKAN" && data.status !== "DIBATALKAN") {
  const ord = await db.queryOne<any>("order_produksi", {
    where: { id: cur.data.order_produksi_id },
  });
  if (ord.data?.penjualan_id) {
    const sale = await db.queryOne<any>("penjualan", {
      where: { id: ord.data.penjualan_id },
    });
    if (sale.data?.status_transaksi === "VOIDED") {
      throw new Error(
        "Item produksi ini dibatalkan karena penjualannya sudah dibatalkan (VOID)."
      );
    }
  }
}
```

- [ ] **Step 5: Jalankan test, pastikan LULUS**

Run: `npx jest void-sale-side-effects`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/production-service.ts src/lib/__tests__/void-sale-side-effects.test.ts
git commit -m "fix(produksi): cegah hidupkan SPK yang penjualannya VOID"
```

---

### Task 3: Void melepas NSFP (TERPAKAI → TERSEDIA) di kedua jalur

**Files:**
- Modify: `src/lib/services/pos-mutations.ts:1120-1228` (`voidSale`, jalur SQLite/Tauri)
- Create: `supabase/migrations/20260614000000_void_sale_release_nsfp.sql` (jalur web/RPC)
- Test: `src/lib/__tests__/void-sale-side-effects.test.ts` (tambah kasus)

Referensi pola: `createSale` mengunci NSFP di `pos-mutations.ts:520-551` (set `status='TERPAKAI', penjualan_id=saleId`); `compensateFailedSale` melepasnya di :295-315 (set `status='TERSEDIA', penjualan_id=null`). Void harus meniru pelepasan itu.

- [ ] **Step 1: Tulis test gagal (jalur TS)**

Tambahkan di `void-sale-side-effects.test.ts`. Catatan: import `voidSale`, dan karena `voidSale` memanggil `getInventoryMovements`/`recalculateCashbookIfAvailable`/`deleteMaklonPurchasesForSale`, mock modul-modul itu seperti pola di `stock-opname-service.test.ts` (jest.mock per service) agar test fokus ke NSFP.

```ts
test("void melepas NSFP yang terkunci ke penjualan", async () => {
  mockTable("penjualan").set("S2", {
    id: "S2", status_transaksi: "POSTED", dibuat_pada: "2026-06-10",
  });
  mockTable("nsfp_pool").set("N1", {
    id: "N1", status: "TERPAKAI", penjualan_id: "S2",
    tahun: "2026", kode_transaksi: "010", nomor_seri: "0000001",
  });
  await voidSale("S2", "batal uji", "user-1");
  expect(mockTable("nsfp_pool").get("N1").status).toBe("TERSEDIA");
  expect(mockTable("nsfp_pool").get("N1").penjualan_id).toBeNull();
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `npx jest void-sale-side-effects -t "melepas NSFP"`
Expected: FAIL (NSFP tetap TERPAKAI).

- [ ] **Step 3: Tambah pelepasan NSFP di `voidSale` (jalur SQLite)**

Di dalam `db.transaction` `voidSale`, setelah blok update `penjualan` jadi VOIDED (sekitar `pos-mutations.ts:1196`), tambahkan pelepasan semua NSFP yang menunjuk penjualan ini:

```ts
const nsfpRows = await db.query<any>("nsfp_pool", {
  where: { penjualan_id: id },
});
if (nsfpRows.error) throw nsfpRows.error;
for (const n of nsfpRows.data || []) {
  if (n.status !== "TERPAKAI") continue;
  const updNsfp = await db.update("nsfp_pool", n.id, {
    status: "TERSEDIA",
    penjualan_id: null,
    diperbarui_pada: getCurrentTimestamp(),
  });
  if (updNsfp.error) throw updNsfp.error;
}
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `npx jest void-sale-side-effects`
Expected: PASS.

- [ ] **Step 5: Buat migrasi RPC untuk jalur web**

Buat `supabase/migrations/20260614000000_void_sale_release_nsfp.sql`. Cara teraman & paling ringkas: `CREATE OR REPLACE` ulang fungsi `void_sale_with_inventory` PERSIS seperti versi di `20260613000000_void_sale_cancel_production.sql`, lalu sisipkan SATU blok UPDATE `nsfp_pool` sebelum `RETURN`. Salin badan fungsi dari migrasi 20260613000000 (jangan tulis ulang dari ingatan — baca file itu), dan tambahkan:

```sql
  -- Lepas NSFP yang terkunci ke penjualan ini (TERPAKAI -> TERSEDIA), konsisten
  -- dengan compensateFailedSale. Faktur pajak batal => nomor seri bisa dipakai lagi.
  UPDATE nsfp_pool
  SET status = 'TERSEDIA',
      penjualan_id = NULL,
      diperbarui_pada = NOW()
  WHERE penjualan_id = sale_id
    AND status = 'TERPAKAI';
```

Akhiri file dengan grant yang sama:

```sql
REVOKE EXECUTE ON FUNCTION public.void_sale_with_inventory(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_sale_with_inventory(TEXT, TEXT, TEXT) TO service_role;
```

- [ ] **Step 6: Terapkan migrasi ke lokal & verifikasi**

Run: `npx supabase migration up --local`
Expected: "Applying migration 20260614000000...". Lalu verifikasi fungsi memuat blok NSFP:

```bash
docker exec supabase_db_gemiprintaio psql -U postgres -d postgres -t -c "SELECT pg_get_functiondef('public.void_sale_with_inventory(text,text,text)'::regprocedure) LIKE '%nsfp_pool%';"
```
Expected: `t`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/pos-mutations.ts supabase/migrations/20260614000000_void_sale_release_nsfp.sql src/lib/__tests__/void-sale-side-effects.test.ts
git commit -m "fix(pos): void melepas NSFP terkunci di jalur SQLite + RPC"
```

---

### Task 4: Verifikasi akhir (wajib sebelum 'selesai')

- [ ] **Step 1: Gate lengkap**

Run: `npm run type-check && npm run build && npx jest`
Expected: 0 type error, build sukses, semua test lulus.

- [ ] **Step 2: Uji end-to-end manual di app**

Void penjualan ber-SPK + kena PPN (punya NSFP). Pastikan: (a) /keuangan tidak lagi menampilkan/menghitung baris penjualan itu, (b) SPK-nya DIBATALKAN dan editor status menolak mengubahnya, (c) NSFP-nya kembali TERSEDIA di pool dan bisa dipilih untuk faktur lain.

- [ ] **Step 3: Update graph (opsional)**

Run: `graphify update .`

---

## Catatan eksekusi penting

- **DB lokal sudah punya migrasi 20260613000000** (diterapkan di sesi sebelumnya). Hanya migrasi BARU 20260614000000 yang perlu di-`migration up`.
- **Jangan edit migrasi lama** yang sudah diterapkan (immutable). NSFP release jalur web HARUS lewat file migrasi baru.
- **Dua jalur void harus sinkron.** Jangan perbaiki satu jalur saja — RPC (web) dan TS (SQLite/Tauri) keduanya wajib.
- Owner bukan programmer: jelaskan hasil singkat dalam Bahasa Indonesia di akhir.
- Owner menjalankan `npm run supabase:db:push` untuk menerapkan migrasi ke cloud (lakukan setelah owner setuju).

## Self-Review

- **Spec coverage:** 3 celah terbukti → Task 1 (keuangan display), Task 2 (guard SPK), Task 3 (NSFP release). Task 4 verifikasi. Tidak ada celah teridentifikasi yang tak tertangani.
- **Placeholder scan:** tidak ada TODO/TBD; setiap step kode menampilkan kode nyata dengan anchor baris.
- **Konsistensi:** nama tabel (`nsfp_pool`, `order_produksi`, `penjualan`, `keuangan`), kolom (`status_transaksi`, `penjualan_id`, `status`), dan fungsi (`updateProductionOrderStatus`, `updateProductionItemStatus`, `voidSale`, `void_sale_with_inventory`) konsisten di semua task.

## Execution Handoff

Plan tersimpan di `docs/superpowers/plans/2026-06-10-void-penjualan-reverse-lengkap.md`. Dua opsi eksekusi:

1. **Subagent-Driven (disarankan)** — satu subagent per task, review di antara task. Catatan project: jalankan subagent SATU per satu, jangan paralel.
2. **Inline Execution** — eksekusi berurutan di sesi baru pakai skill executing-plans dengan checkpoint review.
