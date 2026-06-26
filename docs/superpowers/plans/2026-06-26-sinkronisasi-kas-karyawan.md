# Perbaikan Sinkronisasi Nilai Kas (Karyawan + Pengurus Usaha) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nilai Kas, Modal Kas, Saldo Kas di halaman Karyawan dan panel Pengurus Usaha langsung benar setelah setiap transaksi di halaman Keuangan (< 2 detik, tanpa nilai salah sementara seperti −Rp 300.000).

**Architecture:** Dua-layer fix: (1) O(1) incremental recalc mendeteksi prevRow dengan TC kosong untuk metrik global dan langsung fall back ke full recalc, (2) full recalc dipercepat dari O(N × round-trip) → O(1) round-trip via batch Postgres RPC, sehingga fallback tidak menambah latency berarti.

**Tech Stack:** Next.js server actions, Supabase Postgres (RPC via `sb.rpc`), `better-sqlite3` (fallback, tidak berubah), Jest (node project).

---

## Peta File

| File | Aksi | Isi Perubahan |
|------|------|---------------|
| `src/lib/services/finance-service.ts` | Modify | Tambah deteksi TC kosong di `recalculateAppendedCashbookEntry`; ganti loop sequential dengan batch RPC di `recalculateCashbookViaSupabase` |
| `supabase/migrations/20260626000000_fn_bulk_update_keuangan.sql` | Create | Postgres function `bulk_update_keuangan(jsonb)` |
| `database/sqlite-schema.sql` | No change | RPC hanya Supabase; SQLite path tetap sequential |
| `src/lib/__tests__/keuangan-saldo-fix.test.ts` | Modify | Tambah test case demonstrasi RC-1 dan verifikasi logika pengecekan prevRow TC |

---

## Task 1: Test demonstrasi root cause RC-1 + helper pengecekan prevOutputs

**Files:**
- Modify: `src/lib/__tests__/keuangan-saldo-fix.test.ts`

Tambahkan dua describe block baru di akhir file yang ada.

- [ ] **Step 1.1: Tulis dua test case baru di `keuangan-saldo-fix.test.ts`**

Buka file. Di bagian paling bawah (setelah closing `});` dari describe block terakhir), tambahkan:

```ts
describe("computeSingleCashbookRowUpdate — prevOutputs TC-only kosong", () => {
  const row = (
    id: string,
    order: number,
    kat: string,
    debit = 0,
    kredit = 0,
  ): CashbookRecalcInputRow => ({
    id,
    tanggal: "2026-06-01",
    kategori_transaksi: kat,
    debit,
    kredit,
    keperluan: "",
    urutan_tampilan: order,
    dibuat_pada: `2026-06-01T00:00:0${order}.000Z`,
  });

  it("RC-1 — ketika prevOutputs tidak punya kas, kredit menghasilkan kas negatif dari nol (bukan kumulatif)", () => {
    // Ini mendemonstrasikan bug: prevRow tidak punya kas di TC,
    // sehingga O(1) recalc mulai dari 0 dan menghasilkan -300.000.
    const prevOutputs = {}; // prevRow tidak punya TC untuk kas
    const newRow = row("new", 2, "KAS", 0, 300_000);
    const result = computeSingleCashbookRowUpdate(newRow, prevOutputs, 1);
    // kas tidak ada di DEFAULT_FORMULAS standar, tapi saldo menunjukkan pola yang sama:
    // tanpa prevOutputs.saldo → saldo = 0 - 300.000 = -300.000
    expect(result.computed.saldo).toBe(-300_000);
    // Persis inilah yang terjadi pada kas saat prevRow TC kosong.
  });

  it("prevOutputs dengan saldo kumulatif menghasilkan nilai yang benar", () => {
    // Ini menunjukkan O(1) berjalan benar saat prevRow punya TC.
    const prevOutputs = { saldo: 1_500_000 };
    const newRow = row("new", 2, "KAS", 0, 300_000);
    const result = computeSingleCashbookRowUpdate(newRow, prevOutputs, 1);
    expect(result.computed.saldo).toBe(1_200_000); // 1.500.000 - 300.000
  });
});

describe("prevRowMissingGlobalTc — pengecekan prevOutputs untuk metrik global", () => {
  // Helper ini akan diimplementasi di Task 2.
  // Test ini ditulis dulu (TDD) untuk memastikan logika benar.
  it("mengembalikan false bila prevRow null (baris pertama di buku kas)", () => {
    // prevRow = null berarti tidak ada baris sebelumnya → O(1) aman berjalan dari 0
    expect(prevRowMissingGlobalTc(null, {})).toBe(false);
  });

  it("mengembalikan true bila prevRow ada tapi kas undefined di prevOutputs", () => {
    const prevRow = { id: "prev-1" } as unknown as CashbookRecalcInputRow;
    expect(prevRowMissingGlobalTc(prevRow, { saldo: 1_000 })).toBe(true);
  });

  it("mengembalikan false bila semua tiga metrik global ada (termasuk jika nilainya 0)", () => {
    const prevRow = { id: "prev-1" } as unknown as CashbookRecalcInputRow;
    const prevOutputs = { kas: 0, modal_kas: 500_000, saldo_kasbon: 0 };
    expect(prevRowMissingGlobalTc(prevRow, prevOutputs)).toBe(false);
  });

  it("mengembalikan true bila modal_kas undefined", () => {
    const prevRow = { id: "prev-1" } as unknown as CashbookRecalcInputRow;
    expect(prevRowMissingGlobalTc(prevRow, { kas: 100_000, saldo_kasbon: 0 })).toBe(true);
  });
});
```

Tambahkan import `prevRowMissingGlobalTc` bersama import yang ada di baris 1-6:

```ts
import {
  computeCashbookRecalculationUpdates,
  computeSingleCashbookRowUpdate,
  sortCashbookRowsForRecalc,
  type CashbookRecalcInputRow,
} from "@/lib/ast/cashbook-recalc";
import { parseLocalizedAmount } from "@/lib/format-id";
import { prevRowMissingGlobalTc } from "@/lib/services/finance-service";
```

- [ ] **Step 1.2: Jalankan test untuk verifikasi FAIL (TDD)**

```bash
npx jest src/lib/__tests__/keuangan-saldo-fix.test.ts --no-coverage 2>&1 | tail -30
```

Expected: test RC-1 dan prevOutputs kumulatif PASS (mereka hanya menguji `computeSingleCashbookRowUpdate` yang sudah ada). Test `prevRowMissingGlobalTc` FAIL dengan "prevRowMissingGlobalTc is not a function" — ini benar karena kita belum mengimplementasinya.

---

## Task 2: Implementasi `prevRowMissingGlobalTc` + fallback di `recalculateAppendedCashbookEntry`

**Files:**
- Modify: `src/lib/services/finance-service.ts`

- [ ] **Step 2.1: Ekspor helper `prevRowMissingGlobalTc` di `finance-service.ts`**

Di `src/lib/services/finance-service.ts`, cari konstanta `TC_ONLY_METRIC_KEYS` (sekitar baris 223):

```ts
/** Kunci metrik kumulatif yang hanya disimpan di transaksi_terhitung (bukan kolom keuangan). */
const TC_ONLY_METRIC_KEYS = ["modal_kas", "saldo_kasbon", "kas"] as const;
```

Langsung setelah baris itu, tambahkan helper:

```ts
/**
 * Periksa apakah prevRow ada tapi prevOutputs tidak memiliki nilai terdefinisi
 * untuk setidaknya satu metrik global (kas, modal_kas, saldo_kasbon).
 *
 * Jika true, O(1) recalc akan menghitung dari 0 dan menghasilkan nilai salah —
 * caller harus menjalankan full recalc sebagai gantinya.
 */
export function prevRowMissingGlobalTc(
  prevRow: { id: string } | null,
  prevOutputs: Record<string, number | undefined>,
): boolean {
  if (!prevRow) return false;
  return TC_ONLY_METRIC_KEYS.some((k) => prevOutputs[k] == null);
}
```

- [ ] **Step 2.2: Tambahkan pengecekan di `recalculateAppendedCashbookEntry`**

Di fungsi yang sama, cari blok setelah `prevOutputs` dibangun. Saat ini sekitar baris 315-321:

```ts
    const prevOutputs = prevRow
      ? buildOutputRowFromPersisted(
          prevRow,
          await getComputedRow(prevRow.id),
          formulas,
        )
      : {};
```

Tepat setelah blok itu (sebelum `const batch = computeSingleCashbookRowUpdate(...)`), tambahkan:

```ts
    // Jika prevRow ada tapi TC-nya tidak punya metrik global (kas, modal_kas,
    // saldo_kasbon), O(1) recalc akan mulai dari 0 dan menghasilkan nilai salah
    // (mis. kas = 0 − 300.000 = −300.000 bukan nilai kumulatif yang benar).
    // Kembalikan false agar caller menjalankan full recalc.
    if (prevRowMissingGlobalTc(prevRow, prevOutputs)) {
      console.warn(
        `[recalculateAppendedCashbookEntry] prevRow ${prevRow?.id} ` +
          `tidak punya TC untuk metrik global — fallback ke full recalc`,
      );
      return false;
    }
```

- [ ] **Step 2.3: Jalankan test untuk verifikasi PASS**

```bash
npx jest src/lib/__tests__/keuangan-saldo-fix.test.ts --no-coverage 2>&1 | tail -20
```

Expected: semua test PASS termasuk group `prevRowMissingGlobalTc`.

- [ ] **Step 2.4: Type-check**

```bash
npm run type-check 2>&1 | tail -20
```

Expected: 0 errors.

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/__tests__/keuangan-saldo-fix.test.ts src/lib/services/finance-service.ts
git commit -m "fix: O(1) recalc fallback ketika prevRow TC kosong untuk metrik global

Ketika baris sebelumnya tidak punya transaksi_terhitung untuk kas/modal_kas/
saldo_kasbon, O(1) recalc mulai dari 0 dan menghasilkan nilai salah (mis.
kas = -300.000). Sekarang mendeteksi kondisi ini dan return false agar
caller menjalankan full recalc yang benar."
```

---

## Task 3: Migrasi Postgres — fungsi `bulk_update_keuangan`

**Files:**
- Create: `supabase/migrations/20260626000000_fn_bulk_update_keuangan.sql`

- [ ] **Step 3.1: Buat file migrasi**

```sql
-- Fungsi RPC untuk memperbarui banyak baris keuangan sekaligus (satu round-trip).
-- Menggantikan loop sequential di recalculateCashbookViaSupabase yang lambat
-- karena setiap UPDATE adalah round-trip terpisah ke Supabase.
--
-- Parameter: updates JSONB — array objek, masing-masing berisi "id" (UUID)
-- dan kolom yang perlu diperbarui. Kolom yang tidak ada di objek tidak ditimpa
-- (dijaga dengan COALESCE).
--
-- Contoh payload:
--   [{"id":"abc","saldo":1000000,"omzet":500000},{"id":"def","saldo":2000000}]

CREATE OR REPLACE FUNCTION bulk_update_keuangan(updates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec jsonb;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(updates) LOOP
    UPDATE keuangan
    SET
      saldo             = COALESCE((rec->>'saldo')::numeric,             saldo),
      omzet             = COALESCE((rec->>'omzet')::numeric,             omzet),
      biaya_operasional = COALESCE((rec->>'biaya_operasional')::numeric, biaya_operasional),
      biaya_bahan       = COALESCE((rec->>'biaya_bahan')::numeric,       biaya_bahan),
      laba_bersih       = COALESCE((rec->>'laba_bersih')::numeric,       laba_bersih)
    WHERE id = (rec->>'id')::uuid;
  END LOOP;
END;
$$;
```

- [ ] **Step 3.2: Verifikasi file tersimpan**

```bash
cat supabase/migrations/20260626000000_fn_bulk_update_keuangan.sql | head -5
```

Expected: output menampilkan baris komentar pertama file.

- [ ] **Step 3.3: Commit migrasi**

```bash
git add supabase/migrations/20260626000000_fn_bulk_update_keuangan.sql
git commit -m "migration: tambah RPC bulk_update_keuangan untuk batch update keuangan

Menggantikan N sequential UPDATE dengan satu Postgres function call,
sehingga full recalc turun dari 10-20 detik menjadi < 2 detik."
```

---

## Task 4: Gunakan batch RPC di `recalculateCashbookViaSupabase`

**Files:**
- Modify: `src/lib/services/finance-service.ts`

- [ ] **Step 4.1: Refactor loop sequential menjadi batch RPC di `recalculateCashbookViaSupabase`**

Cari fungsi `recalculateCashbookViaSupabase` (sekitar baris 420). Di dalamnya, cari loop:

```ts
  for (const { id, updates, computed } of batch) {
    if (Object.keys(updates).length > 0) {
      const res = await db.update("keuangan", id, updates);
      if (res.error) {
        console.warn("recalculateCashbookViaSupabase update:", res.error);
      }
    }

    const rowOverrides = overrideMap.get(id);
    for (const [formulaKey, value] of Object.entries(computed)) {
      const ov = rowOverrides?.get(formulaKey);
      computedRows.push({
        transaction_id: id,
        formula_key: formulaKey,
        value: ov ?? value,
        computed_at: nowIso,
      });
    }
  }
```

Ganti seluruh loop itu dengan:

```ts
  // Kumpulkan semua baris yang butuh update keuangan dan baris TC.
  const keuanganBatchUpdates: Record<string, unknown>[] = [];

  for (const { id, updates, computed } of batch) {
    if (Object.keys(updates).length > 0) {
      keuanganBatchUpdates.push({ id, ...updates });
    }

    const rowOverrides = overrideMap.get(id);
    for (const [formulaKey, value] of Object.entries(computed)) {
      const ov = rowOverrides?.get(formulaKey);
      computedRows.push({
        transaction_id: id,
        formula_key: formulaKey,
        value: ov ?? value,
        computed_at: nowIso,
      });
    }
  }

  // Perbarui kolom keuangan: satu RPC call menggantikan N sequential updates.
  if (keuanganBatchUpdates.length > 0) {
    const { error: rpcErr } = await sb.rpc("bulk_update_keuangan", {
      updates: keuanganBatchUpdates,
    });
    if (rpcErr) {
      // RPC mungkin belum tersedia (migrasi belum dijalankan) — fallback sequential.
      console.warn(
        "bulk_update_keuangan RPC tidak tersedia, fallback sequential:",
        rpcErr.message,
      );
      for (const { id, updates } of batch) {
        if (Object.keys(updates).length > 0) {
          const res = await db.update("keuangan", id, updates);
          if (res.error) {
            console.warn("recalculateCashbookViaSupabase update:", res.error);
          }
        }
      }
    }
  }
```

- [ ] **Step 4.2: Type-check setelah perubahan**

```bash
npm run type-check 2>&1 | tail -20
```

Expected: 0 errors. Jika ada error TypeScript pada `sb.rpc(...)`, tambahkan type cast: `updates: keuanganBatchUpdates as unknown[]`.

- [ ] **Step 4.3: Jalankan semua test yang relevan**

```bash
npx jest src/lib/__tests__/keuangan-saldo-fix.test.ts src/lib/__tests__/periode-metrics-service.test.ts --no-coverage 2>&1 | tail -30
```

Expected: semua PASS.

- [ ] **Step 4.4: Build untuk verifikasi final**

```bash
npm run build 2>&1 | tail -30
```

Expected: Build success tanpa error.

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/services/finance-service.ts
git commit -m "perf: ganti loop sequential keuangan dengan batch RPC di full recalc

recalculateCashbookViaSupabase sekarang mengumpulkan semua update keuangan
ke satu array lalu memanggil bulk_update_keuangan RPC sekali. Fallback ke
sequential tersedia bila RPC belum terdeploy. Perkiraan speedup: dari
~15 detik menjadi < 2 detik untuk buku kas 100+ baris."
```

---

## Task 5: Verifikasi end-to-end dan push migrasi

**Files:** (hanya verifikasi — tidak ada perubahan kode)

- [ ] **Step 5.1: Jalankan full test suite untuk memastikan tidak ada regresi**

```bash
npx jest --testPathPattern="src/lib/__tests__" --no-coverage 2>&1 | tail -20
```

Expected: semua test PASS. Tidak ada test yang sebelumnya PASS sekarang FAIL.

- [ ] **Step 5.2: Type-check final**

```bash
npm run type-check 2>&1 | grep -E "error|Error" | wc -l
```

Expected: output `0`.

- [ ] **Step 5.3: Instruksi untuk pemilik — push migrasi ke Supabase**

Migrasi `20260626000000_fn_bulk_update_keuangan.sql` perlu diaplikasikan ke Supabase cloud. Jalankan:

```bash
npm run supabase:db:push
```

Tanpa langkah ini, full recalc akan tetap memakai fallback sequential (10–20 detik). Setelah push, performa akan langsung membaik.

- [ ] **Step 5.4: Verifikasi RPC tersedia di Supabase (opsional)**

Setelah `supabase:db:push`, cek di Supabase Dashboard → SQL Editor → jalankan:

```sql
SELECT proname FROM pg_proc WHERE proname = 'bulk_update_keuangan';
```

Expected: satu baris dengan `bulk_update_keuangan`.

---

## Catatan Implementasi

- **Backward compat**: Fallback sequential di `recalculateCashbookViaSupabase` memastikan kode tetap bekerja bahkan sebelum migrasi dijalankan. Tidak ada downtime.
- **SQLite path**: Tidak berubah. `recalculateCashbook(sqlite)` di `recalculateCashbookCore` masih menjalankan loop-nya sendiri (tanpa network latency, jadi tidak ada masalah performa).
- **Efek pada UX**: Setelah Task 2 + 4 diterapkan dan migrasi dijalankan, transaksi baru akan membutuhkan ~1-2 detik total (fallback ke full recalc via RPC) dan menampilkan nilai Kas/Modal Kas/Saldo Kas yang benar di halaman Karyawan tanpa melalui fase nilai salah sementara.
