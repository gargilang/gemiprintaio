# Fase 2 — Integritas Data & Service Layer Implementation Plan

> **Untuk agentic workers:** REQUIRED SUB-SKILL: gunakan superpowers:subagent-driven-development (disarankan) atau superpowers:executing-plans untuk eksekusi task demi task. Semua step pakai checkbox (`- [x]`).

**Goal:** Menutup bug data-integrity: composite mutation non-atomik, payload_hash palsu, item ordering, normalizeRecord false-positive, N+1, dan error PostgREST mentah (D-C1..D-C4, D-I1..D-I8, minor DB).

**Architecture:** Aktifkan kembali RPC Postgres yang SUDAH ADA di migrasi (`create_sale_with_inventory`, `create_purchase_with_inventory`, `void_*`) lewat flag env eksplisit; tambah compensating cleanup sebagai fallback; perbaiki helper db-unified yang rapuh; tambah layer translasi error PG → Bahasa Indonesia.

**Tech Stack:** Supabase Postgres RPC (SECURITY DEFINER), better-sqlite3, TypeScript service layer, Jest dengan mock-db.

**Sumber temuan:** `docs/superpowers/specs/2026-06-04-codebase-review.md` bagian 2 (Database dan Service Layer).

**Konteks penting (sudah diverifikasi):** RPC composite mutation sudah ada di `supabase/migrations/20260523160932_inventory_ledger_void_workflow.sql` dan `20260524005100_ppn_aware_rpcs.sql`. Jadi D-C1/D-C2 adalah soal WIRING + flag, bukan menulis SQL dari nol.

---

## File Structure

- Modify: `src/lib/services/purchases-mutations.ts` — hidupkan blok RPC via flag, hapus `if (false && sb)`.
- Modify: `src/lib/services/pos-mutations.ts` — RPC sale via flag, fix item ordering (D-I1), debounce recalc (D-I8).
- Modify: `src/lib/db-unified.ts` — payload_hash sha256 (D-C3), normalizeRecord whitelist (D-I2), INSERT OR IGNORE → ON CONFLICT (D-I4), select eksplisit (D-I7), whitelist identifier (minor).
- Modify: `src/lib/db-sqlite.ts` — tambah `business_actors`, `actor_roles` ke `SYNC_V2_TABLES` urut FK (D-C4).
- Create: `src/lib/pg-error.ts` — `friendlyPgError(e, table)` (D-I6).
- Create: `src/lib/__tests__/pg-error.test.ts`, `src/lib/__tests__/normalize-record.test.ts`, `src/lib/__tests__/payload-hash.test.ts`.
- Modify: `src/lib/services/pos-queries.ts`, `production-service.ts` — batch query (D-I3).
- Modify: `src/lib/services/purchases-queries.ts`, `pos-mutations.ts` — retry-loop nomor faktur (D-I5).

Prinsip: ubah dengan flag `USE_PG_COMPOSITE_RPC` supaya intent eksplisit dan bisa di-rollback cepat tanpa revert kode.

---

### Task 1: payload_hash jadi SHA-256 asli (D-C3)

**Files:**
- Modify: `src/lib/db-unified.ts:1199`
- Create: `src/lib/__tests__/payload-hash.test.ts`

- [x] **Step 1: Tulis test gagal**

Create `src/lib/__tests__/payload-hash.test.ts`:

```ts
import { createHash } from "crypto";
import { hashPayload } from "../db-unified";

describe("hashPayload", () => {
  test("dua payload beda dengan panjang sama menghasilkan hash berbeda", () => {
    const a = hashPayload({ a: 1, b: 2 });
    const b = hashPayload({ a: 2, b: 1 });
    expect(a).not.toBe(b);
  });

  test("hash sama untuk input identik (deterministik)", () => {
    const x = { nama: "test", nilai: 100 };
    expect(hashPayload(x)).toBe(hashPayload(x));
  });

  test("output adalah hex sha256 (64 char)", () => {
    expect(hashPayload({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

> Catatan: jika export fungsi dari `db-unified.ts` (server-only) bermasalah di Jest node env, tempatkan `hashPayload` di file kecil terpisah `src/lib/payload-hash-util.ts` tanpa `server-only`, lalu import dari db-unified. Pilih opsi ini jika import langsung gagal.

- [x] **Step 2: Jalankan test, harus gagal**

Run: `npx jest src/lib/__tests__/payload-hash.test.ts`
Expected: FAIL (fungsi belum ada).

- [x] **Step 3: Implementasi**

Tambah di `src/lib/db-unified.ts` (atau util terpisah, lihat catatan Step 1):

```ts
import { createHash } from "crypto";

export function hashPayload(data: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}
```

Ganti baris 1199:

```ts
      payload_hash: hashPayload(data),
```

- [x] **Step 4: Test + commit**

Run: `npx jest src/lib/__tests__/payload-hash.test.ts && npm run type-check`

```bash
git add src/lib/db-unified.ts src/lib/__tests__/payload-hash.test.ts
git commit -m "fix(db): real sha256 payload_hash for mutation registry (D-C3)"
```

---

### Task 2: Lengkapi SYNC_V2_TABLES (D-C4)

**Files:**
- Modify: `src/lib/db-sqlite.ts:34-78` (`SYNC_V2_TABLES`)

- [x] **Step 1: Verifikasi tabel hilang vs migrasi**

Bandingkan `SYNC_V2_TABLES` dengan tabel di `supabase/migrations/`. Konfirmasi `actor_roles` dan `business_actors` tidak ada di list. Cek juga `surat_jalan`, `production_material_consumptions` (sudah ada), `biaya_tambahan_penjualan`, dan tabel migrasi lain yang punya kolom sync.

- [x] **Step 2: Tambahkan dengan urutan FK benar**

`actor_roles` harus sebelum `business_actors` (FK dependency). Tambah di posisi yang tepat dalam array (setelah `profil`/`kredensial`, sebelum tabel transaksi):

```ts
  "actor_roles",
  "business_actors",
```

Tambah juga tabel lain yang teridentifikasi di Step 1 dengan urutan FK benar.

- [x] **Step 3: Verifikasi + commit**

Run: `npm run type-check && npm run build`

```bash
git add src/lib/db-sqlite.ts
git commit -m "fix(sync): add actor_roles + business_actors to SYNC_V2_TABLES (D-C4)"
```

> CI check untuk drift SYNC_V2_TABLES vs migrasi ada di Fase 3 (Task version/schema check).

---

### Task 3: Aktifkan RPC composite purchase via flag (D-C1)

**Files:**
- Modify: `src/lib/services/purchases-mutations.ts:117` dan `:915`

**Konteks:** Blok RPC sudah lengkap (membangun payload `create_purchase_with_inventory` dan `void_purchase_with_inventory`). Satu-satunya masalah: gerbang `if (false && sb)` membuatnya mati. Kita ganti `false` dengan flag env eksplisit.

- [x] **Step 1: Tambah helper flag**

Di awal `purchases-mutations.ts` (atau file util bersama `src/lib/feature-flags.ts`):

```ts
// Aktifkan RPC Postgres atomik untuk composite mutation.
// Default ON di Vercel (Supabase-only) supaya mutation atomik.
export function usePgCompositeRpc(): boolean {
  if (process.env.TAURI === "true" || process.env.TAURI === "1") return false;
  return process.env.USE_PG_COMPOSITE_RPC !== "0"; // default aktif
}
```

- [x] **Step 2: Ganti gate dead branch (create)**

Di baris ~117, ganti:

```ts
    if (false && sb) {
```

menjadi:

```ts
    if (usePgCompositeRpc() && sb) {
```

- [x] **Step 3: Ganti gate dead branch (void)**

Di baris ~915, lakukan hal yang sama untuk blok `void_purchase_with_inventory`.

- [x] **Step 4: Verifikasi RPC ada di cloud**

Pastikan migrasi `20260524005100_ppn_aware_rpcs.sql` sudah ter-apply ke Supabase (owner jalankan `npm run supabase:db:push` bila belum). Jika RPC tidak ada, `sb.rpc(...)` error → fallback diperlukan (Task 5).

- [x] **Step 5: Verifikasi + commit**

Run: `npm run type-check && npm run build && npx jest src/lib/__tests__`

```bash
git add src/lib/services/purchases-mutations.ts
git commit -m "fix(db): enable atomic purchase RPC via USE_PG_COMPOSITE_RPC flag (D-C1)"
```

---

### Task 4: Aktifkan RPC composite sale (D-C2)

**Files:**
- Modify: `src/lib/services/pos-mutations.ts`

**Konteks:** `createSale` di mode Supabase-only memanggil `db.transaction()` yang TIDAK atomik (lihat `db-unified.ts:1728-1731`). NSFP slot di-mark TERPAKAI sebelum insert items → kalau item gagal, slot hangus. RPC `create_sale_with_inventory` sudah ada di migrasi.

- [x] **Step 1: Cari titik panggil transaksi sale di pos-mutations**

Identifikasi blok yang membangun penjualan + item + keuangan/piutang + NSFP. Cek apakah ada blok RPC `create_sale_with_inventory` yang juga di-gate `if (false && sb)` seperti purchases. Jika ADA: ganti gate dengan `usePgCompositeRpc() && sb` (sama seperti Task 3).

- [x] **Step 2: Jika blok RPC sale BELUM ada, bangun payload RPC**

Bila `createSale` belum punya cabang RPC, tambahkan cabang baru sebelum `db.transaction()` yang memanggil:

```ts
    if (usePgCompositeRpc() && sb) {
      const { error } = await sb.rpc("create_sale_with_inventory", {
        payload: {
          sale: { /* header penjualan: id, nomor_faktur, pelanggan_id, tanggal, metode, total, ppn fields, nsfp fields */ },
          items: preparedItems,      // array item_penjualan dengan movement_id deterministik
          finance,                   // entri keuangan CASH (atau null)
          receivable,                // piutang NET30/COD (atau null)
          production: productionPayload, // order_produksi + item_produksi (atau null)
        },
      });
      if (error) throw new Error(error.message);
      return { id: saleId };
    }
```

Cocokkan bentuk payload dengan signature RPC di `supabase/migrations/20260524005100_ppn_aware_rpcs.sql` baris 178 (`create_sale_with_inventory`). Baca migrasi itu untuk field exact yang di-INSERT.

> Jika produksi tidak ditangani RPC, biarkan pembuatan order_produksi di luar RPC TAPI setelah RPC sukses (produksi bukan finansial-kritis; kegagalannya tidak meninggalkan NSFP hangus).

- [x] **Step 3: Verifikasi + commit**

Run: `npm run type-check && npm run build && npx jest src/lib/__tests__`

```bash
git add src/lib/services/pos-mutations.ts
git commit -m "fix(db): atomic sale via create_sale_with_inventory RPC (D-C2)"
```

---

### Task 5: Compensating cleanup sebagai fallback (D-C2 mitigasi)

**Files:**
- Modify: `src/lib/services/pos-mutations.ts`, `src/lib/services/purchases-mutations.ts`

**Konteks:** Untuk path yang TIDAK pakai RPC (mis. `USE_PG_COMPOSITE_RPC=0`, atau RPC belum ter-deploy), tambah cleanup di catch agar tidak meninggalkan data setengah jadi.

- [x] **Step 1: Bungkus composite mutation non-RPC dengan try/catch + cleanup**

Pola untuk `createSale` (Supabase-only non-RPC):

```ts
    const inserted: { table: string; id: string }[] = [];
    try {
      // setiap insert sukses → inserted.push({ table, id })
      // mark NSFP TERPAKAI hanya SETELAH semua item ter-insert
    } catch (e) {
      // rollback kompensasi: hapus yang sudah ter-insert (urutan terbalik)
      for (const row of inserted.reverse()) {
        try { await db.delete(row.table, row.id); } catch { /* best-effort */ }
      }
      // lepas NSFP lock jika sudah ter-mark
      throw e;
    }
```

Kunci: **mark NSFP TERPAKAI paling akhir**, setelah semua item ter-insert sukses, untuk meminimalkan jendela slot hangus.

- [x] **Step 2: Verifikasi + commit**

Run: `npm run type-check && npm run build && npx jest src/lib/__tests__`

```bash
git add src/lib/services/pos-mutations.ts src/lib/services/purchases-mutations.ts
git commit -m "fix(db): compensating cleanup for non-RPC composite mutations (D-C2)"
```

---

### Task 6: Fix item ordering bug di createSale (D-I1)

**Files:**
- Modify: `src/lib/services/pos-mutations.ts:677-720` (loop produksi)

**Konteks:** Loop produksi re-query `item_penjualan` dengan `offset: i, orderBy: dibuat_pada`. Karena timestamp bisa kembar, item ke-i bisa salah → finishing dipasang ke item salah.

- [x] **Step 1: Simpan ID item saat loop insert pertama**

Di loop insert `item_penjualan` (yang dijalankan sebelum loop produksi), kumpulkan ID:

```ts
    const insertedItemIds: string[] = [];
    for (let i = 0; i < data.items.length; i++) {
      const itemId = generateId("item"); // atau ID yang dipakai saat insert
      // ... insert item_penjualan dengan id: itemId
      insertedItemIds.push(itemId);
    }
```

Pastikan insert memakai `id` eksplisit (bukan auto-generate di DB), supaya ID diketahui sebelum query balik.

- [x] **Step 2: Pakai insertedItemIds[i] di loop produksi**

Ganti blok re-query (baris 683-691):

```ts
        const itemPenjualanId = insertedItemIds[i];
        if (itemPenjualanId) {
          const itemProdId = `IP-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
          // ... gunakan itemPenjualanId, bukan hasil re-query
```

Hapus `db.query("item_penjualan", { offset: i, orderBy: dibuat_pada })`.

- [x] **Step 3: Verifikasi + commit**

Run: `npm run type-check && npm run build && npx jest src/lib/__tests__`

```bash
git add src/lib/services/pos-mutations.ts
git commit -m "fix(pos): use captured item IDs instead of timestamp re-query (D-I1)"
```

---

### Task 7: normalizeRecord whitelist boolean (D-I2)

**Files:**
- Modify: `src/lib/db-unified.ts:40-57`
- Create: `src/lib/__tests__/normalize-record.test.ts`

**Konteks:** Heuristik `key.includes("status")` salah meng-treat `status_pembayaran` (LUNAS/AKTIF) sebagai boolean.

- [x] **Step 1: Tulis test gagal**

Create `src/lib/__tests__/normalize-record.test.ts`:

```ts
import { normalizeRecord } from "../db-unified";

describe("normalizeRecord boolean detection", () => {
  test("status_pembayaran enum string TIDAK dikonversi ke boolean", () => {
    const r = normalizeRecord({ status_pembayaran: "LUNAS" }, "toSupabase");
    expect(r.status_pembayaran).toBe("LUNAS");
  });

  test("status numeric enum (0/1) TIDAK jadi true/false", () => {
    const r = normalizeRecord({ void_status_kode: 1 }, "toSupabase");
    expect(r.void_status_kode).toBe(1);
  });

  test("aktif_status tetap dikonversi ke boolean", () => {
    const r = normalizeRecord({ aktif_status: 1 }, "toSupabase");
    expect(r.aktif_status).toBe(true);
  });
});
```

> Jika `normalizeRecord` belum di-export, export-lah (named export). Jika `db-unified` server-only menyulitkan, pindah fungsi murni `normalizeRecord` ke `src/lib/normalize-record.ts` lalu re-import.

- [x] **Step 2: Jalankan, harus gagal**

Run: `npx jest src/lib/__tests__/normalize-record.test.ts`
Expected: FAIL (status_pembayaran jadi boolean).

- [x] **Step 3: Ganti heuristik dengan whitelist eksplisit**

Ganti blok deteksi boolean (baris 41-56) dengan whitelist nama field boolean yang diketahui:

```ts
const BOOLEAN_FIELDS = new Set([
  "aktif_status",
  "privat_status",
  "kena_ppn",
  "dapat_dikreditkan",
  "is_deleted",
  "butuh_dimensi_status",
  "lacak_inventori_status",
  "default_status",
  // tambah field boolean lain yang TERVERIFIKASI dari schema
]);

Object.keys(normalized).forEach((key) => {
  if (
    typeof normalized[key] === "number" &&
    (normalized[key] === 0 || normalized[key] === 1) &&
    BOOLEAN_FIELDS.has(key)
  ) {
    normalized[key] = normalized[key] === 1;
  }
});
```

> WAJIB verifikasi daftar `BOOLEAN_FIELDS` terhadap kolom boolean nyata di `database/sqlite-schema.sql` dan migrasi. Jangan tebak — grep kolom yang dipakai sebagai boolean. Field yang berakhiran `_status` TAPI enum string (status_pembayaran, status_transaksi, roll_inventory_status) JANGAN dimasukkan.

- [x] **Step 4: Test + commit**

Run: `npx jest src/lib/__tests__/normalize-record.test.ts && npm run type-check && npm test`

```bash
git add src/lib/db-unified.ts src/lib/__tests__/normalize-record.test.ts
git commit -m "fix(db): whitelist boolean fields in normalizeRecord (D-I2)"
```

---

### Task 8: Layer translasi error PostgREST → Bahasa Indonesia (D-I6)

**Files:**
- Create: `src/lib/pg-error.ts`
- Create: `src/lib/__tests__/pg-error.test.ts`
- Modify: `src/lib/services/pos-mutations.ts:886`, `purchases-mutations.ts:233`, `db-unified.ts:1031`, `:1089`

- [x] **Step 1: Tulis test gagal**

Create `src/lib/__tests__/pg-error.test.ts`:

```ts
import { friendlyPgError } from "../pg-error";

describe("friendlyPgError", () => {
  test("23505 unique violation → pesan nomor sudah dipakai", () => {
    const msg = friendlyPgError({ code: "23505", message: "duplicate key" }, "penjualan");
    expect(msg).toContain("sudah dipakai");
  });

  test("23503 FK violation → data terkait sudah dihapus", () => {
    const msg = friendlyPgError({ code: "23503", message: "fk" }, "penjualan");
    expect(msg).toContain("terkait");
  });

  test("23514 check violation → tidak memenuhi aturan", () => {
    const msg = friendlyPgError({ code: "23514", message: "check" }, "barang");
    expect(msg).toContain("aturan");
  });

  test("error tak dikenal → pesan generik tanpa membocorkan constraint", () => {
    const msg = friendlyPgError({ code: "XXXXX", message: "internal pg detail" }, "x");
    expect(msg).not.toContain("constraint");
    expect(msg.length).toBeGreaterThan(0);
  });
});
```

- [x] **Step 2: Jalankan, harus gagal**

Run: `npx jest src/lib/__tests__/pg-error.test.ts`
Expected: FAIL.

- [x] **Step 3: Implementasi**

Create `src/lib/pg-error.ts`:

```ts
type PgLikeError = { code?: string; message?: string };

export function friendlyPgError(e: unknown, table?: string): string {
  const err = (e || {}) as PgLikeError;
  const ctx = table ? ` (${table})` : "";
  switch (err.code) {
    case "23505":
      return `Nomor atau data sudah dipakai${ctx}. Coba lagi.`;
    case "23503":
      return `Data terkait sudah dihapus atau tidak ditemukan${ctx}.`;
    case "23514":
      return `Data tidak memenuhi aturan validasi${ctx}.`;
    case "23502":
      return `Ada kolom wajib yang kosong${ctx}.`;
    default:
      return `Terjadi kesalahan saat menyimpan data${ctx}.`;
  }
}
```

- [x] **Step 4: Pakai di service mutation**

Ganti `throw new Error(error.message)` di titik yang disebut menjadi:

```ts
import { friendlyPgError } from "@/lib/pg-error";
// ...
throw new Error(friendlyPgError(error, "penjualan"));
```

Sesuaikan nama tabel per call-site.

- [x] **Step 5: Test + commit**

Run: `npx jest src/lib/__tests__/pg-error.test.ts && npm run type-check && npm test`

```bash
git add src/lib/pg-error.ts src/lib/__tests__/pg-error.test.ts src/lib/services/pos-mutations.ts src/lib/services/purchases-mutations.ts src/lib/db-unified.ts
git commit -m "feat(db): friendly Indonesian PG error layer (D-I6)"
```

---

### Task 9: Batch query hot path POS & produksi (D-I3)

**Files:**
- Modify: `src/lib/services/pos-queries.ts:604-655` (`salesWithItems`)
- Modify: `src/lib/services/production-service.ts:123-209`

**Konteks:** Pola pinjam dari `materials-service.ts:67-127` yang sudah batch.

- [x] **Step 1: Ganti loop-per-sale dengan batch IN**

Untuk `salesWithItems`: ambil semua sale dulu, kumpulkan `saleIds`, lalu satu query item dengan `WHERE penjualan_id IN (...)`, lalu group di memori:

```ts
const saleIds = sales.map((s) => s.id);
const items = await db.query("item_penjualan", { whereIn: { penjualan_id: saleIds } });
const byId = new Map<string, any[]>();
for (const it of items.data ?? []) {
  const arr = byId.get(it.penjualan_id) ?? [];
  arr.push(it);
  byId.set(it.penjualan_id, arr);
}
```

> Verifikasi dukungan `whereIn` di `db-unified.ts`. Jika belum ada, gunakan PostgREST embedded select untuk path Supabase: `.select("*, item_penjualan(*), piutang_penjualan(*)")` lewat client supabase langsung, ATAU tambah dukungan `whereIn` di adapter (cek apakah sudah ada operator IN — review menyebut mock-db mulai pakai IN/LIKE).

- [x] **Step 2: Ulangi untuk production-service (orders × items × finishing × profil)**

Batch ambil items by orderIds, finishing by itemIds, profil by userIds — masing-masing satu query.

- [x] **Step 3: Verifikasi + commit**

Run: `npm run type-check && npm run build && npx jest src/lib/__tests__`

```bash
git add src/lib/services/pos-queries.ts src/lib/services/production-service.ts
git commit -m "perf(db): batch queries to remove N+1 in POS & production (D-I3)"
```

---

### Task 10: INSERT OR IGNORE → ON CONFLICT / deteksi 0 changes (D-I4)

**Files:**
- Modify: `src/lib/db-unified.ts:897` (`insertServerSQLite`), `:1939` (syncFromCloud fallback)

- [x] **Step 1: Ganti pattern di path normal**

Untuk `insertServerSQLite` (path normal, bukan sync), deteksi `info.changes === 0` setelah `INSERT OR IGNORE` dan throw:

```ts
const info = stmt.run(...values);
if (info.changes === 0) {
  throw new Error(`Baris sudah ada (konflik PK) di tabel ${table}`);
}
```

- [x] **Step 2: Pakai ON CONFLICT DO UPDATE di syncFromCloud**

Path sync (line 1939) sudah punya pola `ON CONFLICT(id) DO UPDATE SET ...=excluded...` di tempat lain — pakai pola yang sama, bukan OR IGNORE.

- [x] **Step 3: Verifikasi + commit**

Run: `npm run type-check && npm run build && npx jest src/lib/__tests__`

```bash
git add src/lib/db-unified.ts
git commit -m "fix(db): surface PK conflicts instead of silent OR IGNORE (D-I4)"
```

---

### Task 11: Race condition nomor faktur & pembelian (D-I5)

**Files:**
- Modify: `src/lib/services/purchases-queries.ts:259-278`, `src/lib/services/pos-mutations.ts:136-169`

**Konteks:** `generateInvoiceNumber` baca MAX lalu insert tanpa lock. Dua kasir bersamaan → nomor sama → unique constraint reject.

- [x] **Step 1: Tambah retry-loop pada error 23505**

Bungkus pembuatan nomor + insert header dalam retry (maks 3x). Jika insert gagal dengan code 23505 pada kolom nomor, regenerate nomor dan ulang:

```ts
for (let attempt = 0; attempt < 3; attempt++) {
  const nomor = await generateInvoiceNumber(/* ... */);
  try {
    // insert header dengan nomor
    return result;
  } catch (e: any) {
    if (e?.code === "23505" && attempt < 2) continue; // tabrakan nomor, ulang
    throw e;
  }
}
```

> Solusi ideal (sequence Postgres / RPC `next_invoice_number` dengan `SELECT ... FOR UPDATE`) lebih kuat tapi butuh migrasi. Retry-loop adalah mitigasi cukup untuk 2-5 user. Catat di summary bahwa sequence adalah peningkatan masa depan.

- [x] **Step 2: Verifikasi + commit**

Run: `npm run type-check && npm run build && npx jest src/lib/__tests__`

```bash
git add src/lib/services/purchases-queries.ts src/lib/services/pos-mutations.ts
git commit -m "fix(db): retry-loop on invoice number collision (D-I5)"
```

---

### Task 12: Select kolom eksplisit di read path UI (D-I7)

**Files:**
- Modify: `surat-jalan-service.ts:142,157`, `pos-queries.ts:469,488,489,501`, `cashbook-formula-service.ts:129,171,296,305`, `finance-service.ts:439`, `reports-service.ts:315`

- [x] **Step 1: Ganti select(*) read path dengan daftar kolom**

Untuk tiap titik, ganti `select: "*"` (atau default) dengan daftar kolom yang dipakai UI, buang kolom sync metadata (`sync_status, last_synced_at, sync_version, updated_at_server, updated_by_device, change_version, is_deleted, deleted_at, client_mutation_id`).

> Sync engine tetap boleh pakai `*`. Hanya read path UI yang diubah. Verifikasi tiap kolom yang dipakai komponen sebelum memotong — jangan hilangkan kolom yang dipakai.

- [x] **Step 2: Verifikasi + commit**

Run: `npm run type-check && npm run build`

```bash
git add src/lib/services
git commit -m "perf(db): explicit column select on UI read paths (D-I7)"
```

---

### Task 13: Debounce recalc cashbook (D-I8)

**Files:**
- Modify: `src/lib/services/pos-mutations.ts:849,893,1036,1194,1332,1457`
- Modify: route layer `src/app/api/pos/sales/route.ts` dan terkait

**Konteks:** `recalculateCashbookIfAvailable()` dipanggil 6x per request (O(n²)).

- [x] **Step 1: Hapus pemanggilan recalc dari dalam service mutation**

Hapus 6 pemanggilan `recalculateCashbookIfAvailable()` di pos-mutations. Service hanya menulis data.

- [x] **Step 2: Panggil sekali di route layer setelah mutasi**

Di route `pos/sales` (dan route lain yang mengubah keuangan), panggil `recalculateCashbookIfAvailable()` SATU kali setelah service selesai, sebelum return.

> Pastikan semua jalur (createSale, void, delete) yang sebelumnya recalc tetap memicu recalc sekali di route. Jangan ada yang terlewat.

- [x] **Step 3: Verifikasi + commit**

Run: `npm run type-check && npm run build && npx jest src/lib/__tests__`

```bash
git add src/lib/services/pos-mutations.ts src/app/api/pos
git commit -m "perf(finance): coalesce cashbook recalc to once per request (D-I8)"
```

---

### Task 14: Minor DB cleanup

**Files:**
- Modify: `src/lib/db-unified.ts` (whitelist identifier, substr→slice, listener leak, health check)
- Modify: file lain dengan `substr(2, 9)` (14 tempat)

- [x] **Step 1: Whitelist identifier runtime di db-unified**

Di titik interpolasi `table`/`key` (queryTauri dll), tambah validasi regex sebelum interpolasi:

```ts
function assertSafeIdentifier(name: string): void {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Identifier tidak valid: ${name}`);
  }
}
```

Panggil untuk `table` dan setiap `key` di WHERE/ORDER BY sebelum membangun SQL.

- [x] **Step 2: Ganti substr(2, 9) deprecated**

Cari `substr(2, 9)` (Grep) dan ganti dengan `crypto.randomUUID().slice(0, 9)` atau `slice(2, 11)` sesuai konteks. ~14 tempat.

- [x] **Step 3: Hapus listener window.online server-only yang unreachable**

`db-unified.ts:2372-2380` — branch unreachable di file server-only. Hapus blok listener tersebut.

- [x] **Step 4: Verifikasi + commit**

Run: `npm run type-check && npm run build && npm test`

```bash
git add src/lib
git commit -m "chore(db): identifier whitelist, drop deprecated substr, remove dead listener"
```

---

## Self-Review Fase 2

| Temuan | Task | Status |
| ------ | ---- | ------ |
| D-C1 dead RPC purchase | Task 3 | ✓ |
| D-C2 transaksi non-atomik sale | Task 4 + Task 5 (fallback) | ✓ |
| D-C3 payload_hash | Task 1 | ✓ |
| D-C4 SYNC_V2_TABLES | Task 2 | ✓ |
| D-I1 item ordering | Task 6 | ✓ |
| D-I2 normalizeRecord | Task 7 | ✓ |
| D-I3 N+1 | Task 9 | ✓ |
| D-I4 INSERT OR IGNORE | Task 10 | ✓ |
| D-I5 race nomor faktur | Task 11 | ✓ |
| D-I6 error PG mentah | Task 8 | ✓ |
| D-I7 select(*) | Task 12 | ✓ |
| D-I8 recalc 6x | Task 13 | ✓ |
| Minor (identifier, substr, listener) | Task 14 | ✓ |

**Konsistensi tipe:** `usePgCompositeRpc()` dipakai sama di Task 3, 4, 5. `friendlyPgError(e, table)` dan `hashPayload(data)` signature konsisten antar task. `normalizeRecord` dan `BOOLEAN_FIELDS` cocok.

**Catatan ketergantungan:** Task 3/4 mengandalkan RPC sudah ter-deploy ke Supabase. Jika belum, Task 5 (compensating cleanup) jadi jaring pengaman. Owner perlu `npm run supabase:db:push` sebelum mengandalkan path RPC.

## Verifikasi akhir Fase 2

```bash
npm run type-check   # 0 errors
npm run build        # sukses
npm test             # semua pass (payload-hash, normalize-record, pg-error + existing)
```

## Catatan untuk owner (Bahasa Indonesia)

- Transaksi penjualan/pembelian sekarang lebih aman: kalau salah satu langkah gagal, semua dibatalkan (tidak ada nomor faktur "hilang").
- Pesan error saat simpan jadi berbahasa Indonesia yang ramah, bukan pesan teknis Inggris.
- Halaman POS dan produksi jadi lebih cepat di data besar.
- Set `USE_PG_COMPOSITE_RPC=1` (default aktif) di Vercel. Jika ada masalah, set `0` untuk kembali ke jalur lama dengan cleanup otomatis.

